const test = require('node:test');
const assert = require('assert');
const path = require('path');
const { parsePasswordCsvFromChrome } = require('../lib/import-from-chrome.js');

// Turn Map and Set into plain objects and arrays
function jsonReplacer(key, value) {
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  } else if (value instanceof Set) {
    return Array.from(value.values());
  } else {
    return value;
  }
}

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
        host: 'localhost',
        password: 'password',
        login: 'root',
        username: 'root',
        urls: ['http://localhost/admin'],
        comments: 'test bare host name (no TLD)',
      },
    ],
    'localhost:3000': [
      {
        host: 'localhost:3000',
        password: 'password',
        login: 'admin',
        username: 'admin',
        urls: ['http://localhost:3000/'],
        comments: 'test port number',
      },
      {
        host: 'localhost:3000',
        password: 'password',
        login: 'root',
        username: 'root',
        urls: ['http://localhost:3000/users/sign_in'],
        comments: 'test different user on same domain',
      },
    ],
    'nvidia.com': [
      {
        host: 'account.nvidia.com',
        password: 'password',
        login: 'MyUsername',
        username: 'MyUsername',
        urls: ['https://account.nvidia.com/en-US'],
        comments: 'test username',
      },
      {
        host: 'account.nvidia.com',
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
        host: 'accounts.google.com',
        password: 'password',
        login: 'personal@gmail.com',
        email: 'personal@gmail.com',
        urls: ['https://accounts.google.com/AddSession'],
        comments: 'test different user on same domain',
      },
      {
        host: 'accounts.google.com',
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
  });
});
