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

    const g = resolvePathConflictsInPassEntryMap(baseHostToPassEntryMap, aliasMap);

    let conflict = await g.next();
    while (!conflict.done) {
      const { passEntry, path: conflictingPath, alias } = conflict.value;
      let isAliasDefined = !alias || alias === '';

      conflict = await g.next(
        new Promise((resolve, reject) => {
          readline.question(
            `Duplicate/conflicting path detected at ${conflictingPath}. ` +
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
