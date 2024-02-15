'use strict';

const test = require('node:test');
const assert = require('node:assert');
const chalk = require('chalk');
const { parseFile } = require('fast-csv');

// Given `https://account.nvidia.com/en-US` -> nvidia.com
function getBaseHost(url) {
  const { host } = new URL(url);
  const hostParts = host.split('.');

  let baseHostName = hostParts[hostParts.length - 1];
  if (hostParts.length >= 2) {
    baseHostName = `${hostParts[hostParts.length - 2]}.${hostParts[hostParts.length - 1]}`;
  }

  return baseHostName;
}

// Only run tests when using `--test` flag
if (process.env.NODE_TEST_CONTEXT) {
  test('getBaseHost', () => {
    assert.strictEqual(getBaseHost('https://www.google.com'), 'google.com');
    assert.strictEqual(getBaseHost('https://account.nvidia.com/en-US'), 'nvidia.com');
    assert.strictEqual(getBaseHost('http://localhost/admin'), 'localhost');
    assert.strictEqual(getBaseHost('http://localhost:3000/users/sign_in'), 'localhost:3000');
  });
}

function getOtherPassEntriesWithSameHost(passEntry, baseHostToPassEntryMap) {
  // Because we're getting the base host, any URL from the list will do (just choose the
  // first because it's convenient)
  const baseHost = getBaseHost([...passEntry.urls][0]);
  const passEntries = baseHostToPassEntryMap.get(baseHost);

  return passEntries.filter((otherPassEntry) => {
    const otherParsedUrl = new URL([...otherPassEntry.urls][0]);
    const parsedUrl = new URL([...passEntry.urls][0]);

    return otherParsedUrl.host === parsedUrl.host;
  });
}

function handleCsvRow(baseHostToPassEntryMap, row) {
  // console.log('row', row);
  const [_name, url, login, password, note] = row;
  // Good-enough heuristic for my purposes
  const isEmail = login && login.includes('@');
  const baseHost = getBaseHost(url);

  if (!baseHostToPassEntryMap.has(baseHost)) {
    baseHostToPassEntryMap.set(baseHost, []);
  }
  // Check if an entry already exists for this base domain name
  // and account (where the login and password matches)
  const existingEntry = baseHostToPassEntryMap.get(baseHost).find((entry) => {
    const doesLoginMatch = login === entry.username || login === entry.email;
    const doesPasswordMatch = password === entry.password;
    if (doesLoginMatch && doesPasswordMatch) {
      return true;
    }

    return false;
  });
  let currentEntry = existingEntry;
  if (!existingEntry) {
    currentEntry = {
      password: password,
      // username or email (what to put in the login form)
      login: login,
      // Optional username field
      username: isEmail ? undefined : login,
      // Optional email field
      email: isEmail ? login : undefined,
      //
      // https://github.com/browserpass/browserpass-extension?tab=readme-ov-file#how-to-use-the-same-username-and-password-pair-on-multiple-domains
      // https://github.com/passff/passff/issues/466
      urls: new Set([url]),
      comments: note,
    };

    baseHostToPassEntryMap.get(baseHost).push(currentEntry);
  }

  if (isEmail) {
    // Prefer email over username in the login field
    currentEntry.login = login;
    // If the login is an email, store it in the email field
    currentEntry.email = login;
  } else {
    // If the login is a username, store it in the username field
    currentEntry.username = login;
  }

  currentEntry.urls.add(url);
}

function obfuscateRow(row) {
  const row_copy = [...row];
  // Obfuscate the password
  row_copy[4] = '***';
  return row_copy;
}

// Parse the CSV into a map from the base host to an array of pass entries. The caller
// will need to resolve the path conflicts as there might be multiple entries for a given
// host (e.g. multiple accounts on the same domain, or multiple subdomains of the same
// domain with different accounts)
function parsePasswordCsvFromChrome(csvFilePath) {
  const baseHostToPassEntryMap = new Map();

  let rowCount = 0;
  return new Promise((resolve, reject) => {
    parseFile(csvFilePath)
      .on('error', reject)
      .on('data', (row) => {
        try {
          // Make sure the first row is the header we expect
          if (rowCount === 0) {
            assert.strictEqual(row[0], 'name');
            assert.strictEqual(row[1], 'url');
            assert.strictEqual(row[2], 'username');
            assert.strictEqual(row[3], 'password');
            assert.strictEqual(row[4], 'note');
          } else {
            handleCsvRow(baseHostToPassEntryMap, row);
          }

          rowCount += 1;
        } catch (err) {
          reject(
            new Error(`Error handling row on line ${rowCount + 1}: ${obfuscateRow(row)}`, {
              cause: err,
            }),
          );
          // TODO: Cancel the read stream so we stop parsing the file
        }
      })
      .on('end', () => {
        resolve({
          baseHostToPassEntryMap,
          diagnostics: {
            rowCount,
          },
        });
      });
  });
}

// Given a map of host to pass entries, return a finished map of unique paths to pass
// entries. The generator yields to ask for an alias suggestion to resolve path
// conflicts. Pass the alias suggestion back to the generator via
// `generator.next(suggestedALias)`.
//
// An interesting use case for async generators
function* resolvePathConflictsInPassEntryMap(baseHostToPassEntryMap) {
  const pathToPassEntryMap = new Map();

  for (const [baseHost, passEntries] of baseHostToPassEntryMap.entries()) {
    // console.log(`Working on baseHost ${baseHost}`);
    for (const passEntry of passEntries) {
      const fullHost = new URL([...passEntry.urls][0]).host;
      // console.log(`\tWorking on passEntry ${fullHost} ${passEntry.login}`);
      const otherEntriesWithSameBaseHost = passEntries;
      const otherEntriesWithSameFullHost = getOtherPassEntriesWithSameHost(
        passEntry,
        baseHostToPassEntryMap,
      );

      const basePath = baseHost;

      let path = basePath;
      // If there's only one entry with this base host, we can just use the base host as
      // the path
      if (otherEntriesWithSameBaseHost.length === 1) {
        path = basePath;
      }
      // If there's only one entry with this full host, we can just use the full host
      // nested under the base host as the path
      else if (otherEntriesWithSameFullHost.length === 1 && [...passEntry.urls].length === 1) {
        path = `${basePath}/${fullHost}`;
      }
      // Ask caller for alias until we find a unique path
      else {
        let pathConflict;
        let alias;
        // eslint-disable-next-line no-unused-vars
        while ((pathConflict = pathToPassEntryMap.has(path)) || !alias || alias === '') {
          // Ask the caller for an alias
          const providedAlias = yield {
            passEntry,
            conflictingPath: path,
          };
          alias = providedAlias.trim();

          // eslint-disable-next-line max-depth
          if (!alias || alias === '') {
            console.error('Alias cannot be empty');
            // Loop around to ask the caller to provide an alias again
            continue;
          }

          path = `${basePath}/${alias}`;
        }
      }

      // Make sure we're not overwriting an existing entry
      assert(!pathToPassEntryMap.has(path));
      pathToPassEntryMap.set(path, passEntry);
      // console.log(`Adding entry at path ${path}`);
    }
  }

  return pathToPassEntryMap;
}

function printLoginAliasMap(loginAliasMap) {
  // STDOUT is for data, STDERR is for commentary
  //
  // Print to stderr so that we can use the stdout strictly for the path map output for
  // easier piping and composability of this utility
  console.error(
    `\n\n=========== Updated ${chalk.yellow('login-aliases.json')} ===========\n`,
    JSON.stringify(Object.fromEntries(loginAliasMap.entries()), null, 2),
    `\n=========== ^^^ Updated ${chalk.yellow('login-aliases.json')} (copy to your own aliases file) ^^^ ===========`,
  );
}

// Given a map of host to pass entries, return a finished map of unique paths to pass
// entries. Whenever there is a conflict, interactively ask the user in the console for
// an alias to resolve the conflict. Remembers aliases that the user has already
// provided so that the user doesn't have to re-enter the same alias for the same login.
//
// When the user tries to exit early with Ctrl+C, print the current state of the login
// alias map so they can use their current progress next time if they choose to copy it
// back to their aliases file.
async function interactiveResolvePathConflictsInPassEntryMap(
  baseHostToPassEntryMap,
  loginAliasMap,
) {
  const readline = require('node:readline').createInterface({
    input: process.stdin,
    // STDOUT is for data, STDERR is for commentary
    //
    // Print to stderr so that we can use the stdout strictly for the path map output for
    // easier piping and composability of this utility
    output: process.stderr,
  });
  try {
    // When the user tries to exit early with Ctrl+C, print the current state of the login
    // alias map so they can use their current progress next time if they choose to copy it
    // back to their aliases file.
    readline.on('SIGINT', function () {
      printLoginAliasMap(loginAliasMap);
      // eslint-disable-next-line n/no-process-exit
      process.exit();
    });

    const resolveConflictsGenerator = resolvePathConflictsInPassEntryMap(baseHostToPassEntryMap);
    let conflict = resolveConflictsGenerator.next();
    let previousPassEntry;
    while (!conflict.done) {
      const { passEntry, conflictingPath } = conflict.value;
      const previousAlias = loginAliasMap.get(passEntry.login);

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
      loginAliasMap.set(passEntry.login, providedAlias);

      // Pass the provided alias back to the generator and get the next conflict
      conflict = resolveConflictsGenerator.next(providedAlias);
      previousPassEntry = passEntry;
    }

    const pathToPassEntryMap = conflict.value;
    return pathToPassEntryMap;
  } finally {
    readline.close();
  }
}

module.exports = {
  parsePasswordCsvFromChrome,
  resolvePathConflictsInPassEntryMap,
  interactiveResolvePathConflictsInPassEntryMap,
  printLoginAliasMap,
};
