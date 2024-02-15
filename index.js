'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { jsonReplacer } = require('./lib/json-serialization.js');
const {
  parsePasswordCsvFromChrome,
  interactiveResolvePathConflictsInPassEntryMap,
  printLoginAliasMap,
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
      description: 'Optional: Path to a JSON file containing login aliases',
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
  assert(argValues['chrome-csv'], 'Missing required --chrome-csv argument');
  const { baseHostToPassEntryMap } = await parsePasswordCsvFromChrome(argValues['chrome-csv']);

  const loginAliasMap = new Map();
  if (argValues['login-alias-json']) {
    const loginAliasJson = require(path.resolve(argValues['login-alias-json']));
    for (const [login, alias] of Object.entries(loginAliasJson)) {
      loginAliasMap.set(login, alias);
    }
  }

  const pathToPassEntryMap = await interactiveResolvePathConflictsInPassEntryMap(
    baseHostToPassEntryMap,
    loginAliasMap,
  );
  // Print to STDOUT so the user can pipe and compose this with other commands
  console.log(JSON.stringify(pathToPassEntryMap, jsonReplacer, 2));
  printLoginAliasMap(loginAliasMap);
}

importFromChromeToPass();
