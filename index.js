'use strict';

const path = require('node:path');
const { parseArgs } = require('node:util');
const chalk = require('chalk');
const {
  parsePasswordCsvFromChrome,
  resolvePathConflictsInPassEntryMap,
} = require('./lib/import-from-chrome.js');

const { values: argValues } = parseArgs({
  strict: true,
  options: {
    help: { type: 'boolean' },
    'chrome-csv': {
      type: 'string',
      description: 'Path to the Chrome passwords CSV file',
    },
    'login-alias-json': {
      type: 'string',
      description: 'Path to a JSON file containing login aliases',
    },
  },
});

if (argValues.help) {
  console.log(
    `Usage: npm start -- --chrome-csv <path-to-chrome-csv> --login-alias-json <path-to-login-alias-json>`,
  );
  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
}

async function importFromChromeToPass() {
  const { baseHostToPassEntryMap } = await parsePasswordCsvFromChrome(argValues['chrome-csv']);

  const readline = require('node:readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const aliasMap = new Map();
    if (argValues['login-alias-json']) {
      const loginAliasJson = require(path.resolve(argValues['login-alias-json']));
      for (const [login, alias] of Object.entries(loginAliasJson)) {
        aliasMap.set(login, alias);
      }
    }

    // When someone tries to exit early with Ctrl+C, print the current state of the
    // alias map so they can use their current progress next time if they choose to copy
    // it back to their aliases file.
    readline.on('SIGINT', function () {
      console.log(
        `\n\n=========== Updated ${chalk.yellow('login-aliases.json')} ===========\n`,
        JSON.stringify(Object.fromEntries(aliasMap.entries()), null, 2),
        `\n=========== ^^^ Updated ${chalk.yellow('login-aliases.json')} (copy to your own aliases file) ^^^ ===========`,
      );
      // eslint-disable-next-line n/no-process-exit
      process.exit();
    });

    const g = resolvePathConflictsInPassEntryMap(baseHostToPassEntryMap);

    let conflict = g.next();
    while (!conflict.done) {
      const { passEntry, path: conflictingPath } = conflict.value;

      const previousAlias = aliasMap.get(passEntry.login);
      let isPreviousAliasDefined = !previousAlias || previousAlias === '';

      const providedAlias = await new Promise((resolve, _reject) => {
        readline.question(
          `Duplicate/conflicting path detected at ${chalk.blue(conflictingPath)} for ${chalk.green(passEntry.login)}. ` +
            `Please provide an${isPreviousAliasDefined ? ' different' : ''} alias for this entry (personal, work, etc): `,
          resolve,
        );
      });

      conflict = g.next(providedAlias);
    }

    const pathToPassEntryMap = conflict.value;
    console.log('pathToPassEntryMap', pathToPassEntryMap);
  } finally {
    readline.close();
  }
}

importFromChromeToPass();
