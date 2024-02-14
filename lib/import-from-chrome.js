const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
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
  const [name, url, login, password, note] = row;
  // Good-enough heuristic for my purposes
  const isEmail = login && login.includes('@');
  const baseHost = getBaseHost(url);
  const { host } = new URL(url);

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
  currentEntry = existingEntry;
  if (!existingEntry) {
    currentEntry = {
      host: host,
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
// entries. Tries to automatically resolve conflicts using the given `aliasMap` but the
// generator yields to ask for an alias suggestion if an alias cannot be found or if
// there are path conflicts. Pass the alias suggestion back to the generator via
// `generator.next(suggestedALias)`.
async function* resolvePathConflictsInPassEntryMap(baseHostToPassEntryMap, aliasMap) {
  const pathToPassEntryMap = new Map();

  for (const [baseHost, passEntries] of baseHostToPassEntryMap.entries()) {
    console.log(`Working on baseHost ${baseHost}`);
    for (passEntry of passEntries) {
      console.log(`Working on passEntry ${passEntry.host}`);
      const entriesWithSameHost = passEntries.filter((entry) => entry.host === passEntry.host);

      // If there's only one entry with this host, we can just use the host as the path
      const basePath = `${baseHost}/${passEntry.host}`;
      if (entriesWithSameHost.length === 1) {
        path = basePath;
      }
      // But if there are multiple entries for this host, we need to find or ask the
      // user for a proper alias to resolve this path conflict
      else {
        // Try to automatically find an alias for this entry
        let alias = aliasMap.get(passEntry.login);
        if (alias?.length > 0) {
          path = `${basePath}/${alias}`;
        }

        // Ask the user for an alias to resolve this path conflict with or if we
        // couldn't find an alias automatically
        let pathConflict;
        while ((pathConflict = pathToPassEntryMap.has(path)) || !alias || alias === '') {
          // Ask the caller for an alias
          const providedAlias = await Promise.resolve(
            yield {
              passEntry,
              path,
              alias,
            },
          );
          alias = providedAlias.trim();

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
      console.log(`Adding entry at path ${path}`);
      pathToPassEntryMap.set(path, passEntry);
    }
  }

  return pathToPassEntryMap;
}

module.exports = {
  parsePasswordCsvFromChrome,
  resolvePathConflictsInPassEntryMap,
};