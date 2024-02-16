'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { jsonReplacer } = require('../lib/json-serialization.js');
const {
  parsePasswordCsvFromChrome,
  resolvePathConflictsInPassEntryMap,
} = require('../lib/import-from-chrome.js');

test('parsePasswordCsvFromChrome', async () => {
  const { baseHostToPassEntryMap } = await parsePasswordCsvFromChrome(
    path.resolve(__dirname, './dummy-chrome-passwords.csv'),
  );
  const hostToPassEntryBareObject = JSON.parse(
    JSON.stringify(baseHostToPassEntryMap, jsonReplacer, 2),
  );

  assert.deepStrictEqual(hostToPassEntryBareObject, {
    localhost: [
      {
        password: 'password',
        login: 'root',
        username: 'root',
        urls: ['http://localhost/dashboard'],
        comments: 'test bare host name (no TLD)',
      },
    ],
    'localhost:3000': [
      {
        password: 'password',
        login: 'johnny',
        username: 'johnny',
        urls: ['http://localhost:3000/login'],
        comments: 'test port number',
      },
      {
        password: 'password',
        login: 'root',
        username: 'root',
        urls: ['http://localhost:3000/users/sign_in'],
        comments: 'test different user on same domain',
      },
    ],
    'nvidia.com': [
      {
        password: 'password',
        login: 'MyUsername',
        username: 'MyUsername',
        urls: ['https://account.nvidia.com/en-US'],
        comments: 'test username',
      },
      {
        password: 'password',
        login: 'personal@gmail.com',
        email: 'personal@gmail.com',
        urls: [
          'https://account.nvidia.com/en-US',
          'https://login.developer.nvidia.com/login',
          'https://login.nvgs.nvidia.com/v1/sign-in',
          'https://www.nvidia.com/en-us/account/',
        ],
        comments: 'test email',
      },
    ],
    'google.com': [
      {
        password: 'password',
        login: 'personal@gmail.com',
        email: 'personal@gmail.com',
        urls: ['https://accounts.google.com/AddSession'],
        comments: 'test different user on same domain',
      },
      {
        password: 'password',
        login: 'work@gmail.com',
        email: 'work@gmail.com',
        urls: [
          'https://accounts.google.com/AddSession',
          'https://accounts.google.com/ServiceLogin',
        ],
        comments: 'test different user on same domain',
      },
    ],
    'johnny-appleseed.com': [
      {
        password: 'password',
        login: 'johnny',
        username: 'johnny',
        urls: ['https://johnny-appleseed.com/'],
        comments: 'test personal site',
      },
      {
        password: 'password',
        login: 'me@johnny-appleseed.com',
        email: 'me@johnny-appleseed.com',
        urls: ['https://mail.johnny-appleseed.com/'],
        comments:
          'test different service at subdomain  (should not share with root or other sub-domain)',
      },
      {
        password: 'password',
        login: 'root',
        username: 'root',
        urls: ['https://db.johnny-appleseed.com/'],
        comments:
          'test different service at subdomain (should not share with root or other sub-domain)',
      },
    ],
  });
});

function assertIncludes(arrayLike, expectedNeedle, message) {
  if (![...arrayLike].includes(expectedNeedle)) {
    throw new assert.AssertionError({
      message:
        message ??
        `The input array-like object did not include the expected value (${expectedNeedle})`,
      actual: [...arrayLike],
      expected: expectedNeedle,
      operator: 'assertIncludes',
      stackStartFn: assertIncludes,
    });
  }
}

function assertPassEntryMatches(actualPassEntry, expectedLogin, expectedUrl) {
  try {
    assert.strictEqual(
      actualPassEntry.login,
      expectedLogin,
      `The actual pass entry login (${actualPassEntry.login}) did not match the expected login (${expectedLogin})`,
    );

    assertIncludes(
      actualPassEntry.urls,
      expectedUrl,
      `The pass entry URLs did not include the expected URL (${expectedUrl})`,
    );
  } catch (err) {
    // Wrap the error so the stack trace starts at our custom `assertPassEntryMatches` assertion
    if (err instanceof assert.AssertionError) {
      throw new assert.AssertionError({
        message: err.message,
        actual: err.actual,
        expected: err.expected,
        operator: err.operator,
        stackStartFn: assertPassEntryMatches,
      });
    }

    throw err;
  }
}

test('resolvePathConflictsInPassEntryMap', async () => {
  const { baseHostToPassEntryMap } = await parsePasswordCsvFromChrome(
    path.resolve(__dirname, './dummy-chrome-passwords.csv'),
  );

  const resolveConflictsGenerator = resolvePathConflictsInPassEntryMap(baseHostToPassEntryMap);
  // Get the first conflict
  let conflict = resolveConflictsGenerator.next();
  // Resolve all of the conflicts
  assertPassEntryMatches(conflict.value.passEntry, 'johnny', 'http://localhost:3000/login');
  conflict = resolveConflictsGenerator.next('personal-wordpress-blog');
  assertPassEntryMatches(conflict.value.passEntry, 'root', 'http://localhost:3000/users/sign_in');
  conflict = resolveConflictsGenerator.next('gitlab');
  assertPassEntryMatches(
    conflict.value.passEntry,
    'MyUsername',
    'https://account.nvidia.com/en-US',
  );
  // The "TODO" here is just a note from the user to themselves to merge the username
  // and email in the future. It's how I would literally handle this conflict in my real
  // import so I know to go back and clean up this entry after importing. It's not
  // something we should automatically handle in our program.
  conflict = resolveConflictsGenerator.next('personal (TODO: merge username and email entry)');
  assertPassEntryMatches(
    conflict.value.passEntry,
    'personal@gmail.com',
    'https://account.nvidia.com/en-US',
  );
  conflict = resolveConflictsGenerator.next('personal');
  assertPassEntryMatches(
    conflict.value.passEntry,
    'personal@gmail.com',
    'https://accounts.google.com/AddSession',
  );
  conflict = resolveConflictsGenerator.next('personal');
  assertPassEntryMatches(
    conflict.value.passEntry,
    'work@gmail.com',
    'https://accounts.google.com/AddSession',
  );
  conflict = resolveConflictsGenerator.next('work');

  // We should have resolved all of the conflicts by this point
  assert(
    conflict.done,
    `Expected no more conflicts but found ${JSON.stringify(conflict, jsonReplacer, 2)} ` +
      '(the test fixture or conflict resolution logic might have changed and this test needs to be updated)',
  );

  const pathToPassEntryMap = conflict.value;
  const pathToPassEntryBareObject = JSON.parse(JSON.stringify(pathToPassEntryMap, jsonReplacer, 2));

  // Make sure the final object looks like what we expect with our manual conflict
  // resolution taken into account
  assert.deepStrictEqual(pathToPassEntryBareObject, {
    localhost: {
      password: 'password',
      login: 'root',
      username: 'root',
      urls: ['http://localhost/dashboard'],
      comments: 'test bare host name (no TLD)',
    },
    'localhost:3000/personal-wordpress-blog': {
      password: 'password',
      login: 'johnny',
      username: 'johnny',
      urls: ['http://localhost:3000/login'],
      comments: 'test port number',
    },
    'localhost:3000/gitlab': {
      password: 'password',
      login: 'root',
      username: 'root',
      urls: ['http://localhost:3000/users/sign_in'],
      comments: 'test different user on same domain',
    },
    'nvidia.com/personal (TODO: merge username and email entry)': {
      password: 'password',
      login: 'MyUsername',
      username: 'MyUsername',
      urls: ['https://account.nvidia.com/en-US'],
      comments: 'test username',
    },
    'nvidia.com/personal': {
      password: 'password',
      login: 'personal@gmail.com',
      email: 'personal@gmail.com',
      urls: [
        'https://account.nvidia.com/en-US',
        'https://login.developer.nvidia.com/login',
        'https://login.nvgs.nvidia.com/v1/sign-in',
        'https://www.nvidia.com/en-us/account/',
      ],
      comments: 'test email',
    },
    'google.com/personal': {
      password: 'password',
      login: 'personal@gmail.com',
      email: 'personal@gmail.com',
      urls: ['https://accounts.google.com/AddSession'],
      comments: 'test different user on same domain',
    },
    'google.com/work': {
      password: 'password',
      login: 'work@gmail.com',
      email: 'work@gmail.com',
      urls: ['https://accounts.google.com/AddSession', 'https://accounts.google.com/ServiceLogin'],
      comments: 'test different user on same domain',
    },
    'johnny-appleseed.com/johnny-appleseed.com': {
      password: 'password',
      login: 'johnny',
      username: 'johnny',
      urls: ['https://johnny-appleseed.com/'],
      comments: 'test personal site',
    },
    'johnny-appleseed.com/mail.johnny-appleseed.com': {
      password: 'password',
      login: 'me@johnny-appleseed.com',
      email: 'me@johnny-appleseed.com',
      urls: ['https://mail.johnny-appleseed.com/'],
      comments:
        'test different service at subdomain  (should not share with root or other sub-domain)',
    },
    'johnny-appleseed.com/db.johnny-appleseed.com': {
      password: 'password',
      login: 'root',
      username: 'root',
      urls: ['https://db.johnny-appleseed.com/'],
      comments:
        'test different service at subdomain (should not share with root or other sub-domain)',
    },
  });
});
