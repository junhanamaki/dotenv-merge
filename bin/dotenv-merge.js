#!/usr/bin/env node

'use strict';

const fs = require('fs');
const readline = require('readline');
const { EOL } = require('os');
const childProcess = require('child_process');

function getFilenames(env) {
  return env
    ? ['.env', `.env.${env}`, '.env.local', `.env.${env}.local`]
    : ['.env', '.env.local']
}

function isOption(value) {
  return value === '-e' || value === '-x';
}

function getOptions() {
  const options = {};
  const userArgs = process.argv.slice(2);

  while (userArgs.length > 0) {
    const option = userArgs.shift();

    if (isOption(option)) {
      const args = [];

      while(userArgs.length > 0) {
        if (isOption(userArgs[0])) {
          break;
        }

        args.push(userArgs.shift());
      }

      options[option] = args.join(' ');
    }
  }

  return options;
}

function loadKeyValuesHelper(filenames, onLoad, keyValues = {}) {
  const filenamesDup = filenames.slice();
  const filename = filenamesDup.shift();
  const readStream = fs.createReadStream(filename);
  const nextIteration = filenamesDup.length === 0
    ? () => onLoad(keyValues)
    : () => loadKeyValuesHelper(filenamesDup, onLoad, keyValues);

  readStream.on('error', error => {
    if (error.code === 'ENOENT') {
      nextIteration();
    } else {
      throw error;
    }
  });

  readStream.on('close', () => {
    nextIteration();
  });

  const lineReader = readline.createInterface({ input: readStream });

  lineReader.on('line', line => {
    const keyValue = line.split('=');

    if (keyValue.length > 1) {
      const key = keyValue.shift();

      keyValues[key] = line;
    }
  });
}

function loadKeyValues(filenames, onLoad) {
  loadKeyValuesHelper(filenames, onLoad);
}

function backupDotenv() {
  fs.copyFileSync('.env', 'dotenv-merge.env.backup');
}

function restoreDotenv() {
  if (fs.existsSync('dotenv-merge.env.backup')) {
    fs.copyFileSync('dotenv-merge.env.backup', '.env');

    fs.unlinkSync('dotenv-merge.env.backup');
  }
}

const options = getOptions();

process.on('SIGINT', () => {
  restoreDotenv();

  process.exit();
});

backupDotenv();

loadKeyValues(getFilenames(options['-e']), keyValues => {
  const writer = fs.createWriteStream('.env');

  writer.on('finish', () => {
    const optionX = options['-x'];

    if (optionX && optionX.length > 0) {
      const [command, ...args] = optionX.split(' ');

      childProcess.spawnSync(command, args, { stdio: 'inherit' });
    }

    restoreDotenv();
  });

  Object.values(keyValues).forEach(value => writer.write(`${value}${EOL}`));

  writer.end();
});
