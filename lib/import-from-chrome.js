'use strict';

const test = require('node:test');
const assert = require('assert');
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
      const { host } = new URL([...passEntry.urls][0]);
      // console.log(`\tWorking on passEntry ${host} ${passEntry.login}`);

      let basePath = `${baseHost}`;

      // If there's only one entry with this host, we can just use the host as the path
      let path = basePath;
      // But if there are multiple entries for this host, we need to ask the caller for
      // an alternative alias to resolve this path conflict
      if (passEntries.length > 1) {
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

function getOtherPassEntriesWithSameHost(passEntry, baseHostToPassEntryMap) {
  const passEntries = baseHostToPassEntryMap.get(getBaseHost([...passEntry.urls][0]));

  return passEntries.filter((otherPassEntry) => {
    const otherParsedUrl = new URL([...otherPassEntry.urls][0]);
    const parsedUrl = new URL([...passEntry.urls][0]);

    return otherParsedUrl.host === parsedUrl.host;
  });
}

// Suggestion heuristics:
//
//            ┌─────┐
//            │START│
//            └──┬──┘
//   ____________▽____________       __________________________                    ┌───────────────┐
//  ╱                          ╲     ╱                          ╲                   │Ask for alias  │
// ╱ Are there more than one    ╲___╱ Are there more than one    ╲__________________│(no suggestion)│
// ╲ entry with this base host? ╱yes╲ entry with this full host? ╱yes               └───────────────┘
//  ╲__________________________╱     ╲__________________________╱
//               │no                              │no
//      ┌────────▽───────┐             __________▽__________     ┌───────────────┐
//      │Suggest base host│            ╱                      ╲    │Ask for alias  │
//      └─────────────────┘           ╱ Are there more than    ╲___│(no suggestion)│
//                                    ╲ one URL on this entry? ╱yes└───────────────┘
//                                     ╲______________________╱
//                                                │no
//                                      ┌─────────▽───────┐
//                                      │Suggest full host.│
//                                      └──────────────────┘
//
// Source: https://arthursonzogni.com/Diagon/#Flowchart
// ```
// "START";
//
// if ("Are there more than one entry with this base host?") {
//   if ("Are there more than one entry with this full host?") {
//     "Ask for alias (no suggestion)";
//   } else {
//     if ("Are there more than one URL on this entry?") {
//       "Ask for alias (no suggestion)";
//     } else {
//       "Suggest full host.";
//     }
//   }
// } else {
//   "Suggest base host";
// }
// ```
function* resolvePathConflictsWithHeuristicsInPassEntryMap(baseHostToPassEntryMap) {
  const resolveConflictsGenerator = resolvePathConflictsInPassEntryMap(baseHostToPassEntryMap);
  let conflict = resolveConflictsGenerator.next();
  while (!conflict.done) {
    const { passEntry, conflictingPath } = conflict.value;
    const baseHost = getBaseHost([...passEntry.urls][0]);
    const fullHost = new URL([...passEntry.urls][0]).host;
    const otherEntriesWithSameBaseHost = baseHostToPassEntryMap.get(baseHost);
    const otherEntriesWithSameFullHost = getOtherPassEntriesWithSameHost(
      passEntry,
      baseHostToPassEntryMap,
    );

    let alias;
    if (otherEntriesWithSameBaseHost.length === 1) {
      // Suggest base host
      alias = baseHost;
    } else if (otherEntriesWithSameFullHost.length === 1 && [...passEntry.urls].length === 1) {
      // Suggest full host
      alias = fullHost;
    } else {
      // Ask for alias
      alias = yield {
        passEntry,
        conflictingPath,
      };
    }

    // Pass the provided alias back to the generator and get the next conflict
    conflict = resolveConflictsGenerator.next(alias);
  }

  const pathToPassEntryMap = conflict.value;
  return pathToPassEntryMap;
}

module.exports = {
  parsePasswordCsvFromChrome,
  resolvePathConflictsInPassEntryMap,
  resolvePathConflictsWithHeuristicsInPassEntryMap,
};
