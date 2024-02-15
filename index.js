'use strict';

const path = require('node:path');
const {
  parsePasswordCsvFromChrome,
  resolvePathConflictsInPassEntryMap,
} = require('./lib/import-from-chrome.js');

async function importFromChromeToPass() {
  const { baseHostToPassEntryMap } = await parsePasswordCsvFromChrome(
    path.resolve(__dirname, './test/dummy-chrome-passwords.csv'),
  );

  const readline = require('node:readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    // TODO
    const aliasMap = new Map();

    const g = resolvePathConflictsInPassEntryMap(baseHostToPassEntryMap);

    let conflict = await g.next();
    while (!conflict.done) {
      const { passEntry, path: conflictingPath } = conflict.value;

      const alias = aliasMap.get(passEntry.login);
      let isAliasDefined = !alias || alias === '';

      conflict = await g.next(
        new Promise((resolve, _reject) => {
          readline.question(
            `Duplicate/conflicting path detected at ${conflictingPath} for ${passEntry.login}. ` +
              `Please provide an${isAliasDefined ? ' different' : ''} alias for this entry (personal, work, etc): `,
            resolve,
          );
        }),
      );
    }

    const pathToPassEntryMap = conflict.value;
    console.log('pathToPassEntryMap', pathToPassEntryMap);
  } finally {
    readline.close();
  }
}

importFromChromeToPass();
