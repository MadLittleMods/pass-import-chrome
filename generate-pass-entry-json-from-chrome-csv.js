'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { parseArgs } = require('node:util');
const chalk = require('chalk');
const { jsonReplacer } = require('./lib/json-serialization.js');
const {
  parsePasswordCsvFromChrome,
  interactiveResolvePathConflictsInPassEntryMap,
  printLoginAliasMap,
} = require('./lib/import-from-chrome.js');

// Force enable color support in the terminal regardless of someone piping the output
// (when piping, the `fd` (file descriptor) won't be a TTY which determines color
// support by default but we want to force color). We could alternatively have users set
// FORCE_COLOR=1 in their environment but I'd rather just have this work out of the box
// since piping is kind of an expected use case. See
// https://github.com/chalk/chalk/tree/v4.1.2#chalksupportscolor
//
// TODO: We could use this but this doesn't seem to work when you use `node
// generate-pass-entry-json-from-chrome-csv.js ... | jq .` but does work with `npm run
// generate-pass-entry-json-from-chrome-csv --silent -- ... | jq .`
//
chalk.supportsColor = true;

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

async function generatePassEntryJsonFromChromeCsv() {
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
  // Print to stdout so the user can pipe and compose this with other commands
  console.log(JSON.stringify(pathToPassEntryMap, jsonReplacer, 2));
  // We print the updated login alias map to stderr so it doesn't mess with our actual
  // data output but the user can still see and copy it if they want
  printLoginAliasMap(loginAliasMap);
}

generatePassEntryJsonFromChromeCsv();
