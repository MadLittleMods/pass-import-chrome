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

function printAliasMap(aliasMap) {
  console.log(
    `\n\n=========== Updated ${chalk.yellow('login-aliases.json')} ===========\n`,
    JSON.stringify(Object.fromEntries(aliasMap.entries()), null, 2),
    `\n=========== ^^^ Updated ${chalk.yellow('login-aliases.json')} (copy to your own aliases file) ^^^ ===========`,
  );
}

async function importFromChromeToPass() {
  const { baseHostToPassEntryMap } = await parsePasswordCsvFromChrome(argValues['chrome-csv']);

  const aliasMap = new Map();
  if (argValues['login-alias-json']) {
    const loginAliasJson = require(path.resolve(argValues['login-alias-json']));
    for (const [login, alias] of Object.entries(loginAliasJson)) {
      aliasMap.set(login, alias);
    }
  }

  const readline = require('node:readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    // When someone tries to exit early with Ctrl+C, print the current state of the
    // alias map so they can use their current progress next time if they choose to copy
    // it back to their aliases file.
    readline.on('SIGINT', function () {
      printAliasMap(aliasMap);
      // eslint-disable-next-line n/no-process-exit
      process.exit();
    });

    const resolveConflictsGenerator = resolvePathConflictsInPassEntryMap(baseHostToPassEntryMap);
    let conflict = resolveConflictsGenerator.next();
    let previousPassEntry;
    while (!conflict.done) {
      const { passEntry, conflictingPath } = conflict.value;
      const previousAlias = aliasMap.get(passEntry.login);

      let workingOnSameEntry = previousPassEntry === passEntry;

      let suggestedAlias;
      if (!workingOnSameEntry) {
        suggestedAlias = previousAlias;
      }

      // Ask the user for an alias to resolve the conflict
      let providedAlias = await new Promise((resolve, _reject) => {
        readline.question(
          `Duplicate/conflicting path detected at ${chalk.blue(conflictingPath)} for ${chalk.green(passEntry.login)} with URLs ${[...passEntry.urls].map((url) => chalk.grey(url)).join(', ')}. ` +
            `\n    Please provide an${workingOnSameEntry ? ' different' : ''} alias for this entry (personal, work, etc)` +
            `${suggestedAlias ? ` (suggested: ${chalk.green.bold(suggestedAlias)})` : ''}: `,
          resolve,
        );
      });
      // If the user just hits enter, use the suggested alias
      if (!providedAlias && suggestedAlias) {
        providedAlias = suggestedAlias;
      }

      // Warn if the previous alias is being overwritten
      if (
        previousAlias &&
        // Only warn if the alias is actually different
        previousAlias !== providedAlias &&
        // Don't warn if we're not just spinning our wheels on the same entry looking
        // for something available
        !workingOnSameEntry
      ) {
        console.warn(
          `Overwriting previous alias ${chalk.yellow(previousAlias)} with ${chalk.green(providedAlias)}`,
        );
      }
      // Update the alias map with the provided alias
      aliasMap.set(passEntry.login, providedAlias);

      // Pass the provided alias back to the generator and get the next conflict
      conflict = resolveConflictsGenerator.next(providedAlias);
      previousPassEntry = passEntry;
    }

    const pathToPassEntryMap = conflict.value;
    console.log('pathToPassEntryMap', pathToPassEntryMap);
    printAliasMap(aliasMap);
  } finally {
    readline.close();
  }
}

importFromChromeToPass();
