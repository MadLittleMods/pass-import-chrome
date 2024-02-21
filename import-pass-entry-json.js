'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { parseArgs, promisify } = require('node:util');
const exec = promisify(require('child_process').exec);
const chalk = require('chalk');

const { values: argValues } = parseArgs({
  strict: true,
  options: {
    help: { type: 'boolean' },
    'pass-entry-json': {
      type: 'string',
      description: 'Optional: Path to a JSON file containing login aliases',
    },
  },
});

if (argValues.help) {
  console.log(
    `Usage: node ${path.basename(process.argv[1])} -- --chrome-csv <path-to-chrome-csv> --login-alias-json <path-to-login-alias-json>`,
  );
  // eslint-disable-next-line n/no-process-exit
  process.exit(0);
}

function serializePassEntry(passEntry) {
  assert.strictEqual(typeof passEntry.password, 'string');

  let serializedEntry = `${passEntry.password}\n`;
  if (passEntry.login) {
    serializedEntry += `login: ${passEntry.login}\n`;
  }
  if (passEntry.username) {
    serializedEntry += `username: ${passEntry.username}\n`;
  }
  if (passEntry.email) {
    serializedEntry += `email: ${passEntry.email}\n`;
  }

  for (const url of passEntry.urls.values()) {
    serializedEntry += `url: ${url}\n`;
  }

  if (passEntry.comments) {
    serializedEntry += `comments: ${passEntry.comments}\n`;
  }

  return serializedEntry;
}

// > To escape the single quote, close the quoting before it, insert the single quote,
// > and re-open the quoting.
// >
// > https://stackoverflow.com/questions/15783701/which-characters-need-to-be-escaped-when-using-bash/20053121#20053121
//
// Other answer, https://stackoverflow.com/questions/1250079/how-to-escape-single-quotes-within-single-quoted-strings/1315213#1315213
function escapeStringForBashCommand(str) {
  // Use surrounding single quotes around the `serializedEntry` to avoid shell expansion
  return `'${str.replace(`'`, `'\\''`)}'`;
}

async function insertPassEntry(entryPath, passEntry) {
  assert(entryPath, 'Missing required path argument');
  assert(passEntry, 'Missing required passEntry argument');
  try {
    const serializedEntry = serializePassEntry(passEntry);

    await exec(
      `echo ${escapeStringForBashCommand(serializedEntry)} | pass insert --multiline ${escapeStringForBashCommand(entryPath)}`,
      {
        // Exit if we reach a y/n prompt that we can't answer
        timeout: 1000,
      },
    );
  } catch (err) {
    throw new Error(`Error serializing entry at ${entryPath}`, {
      cause: err,
    });
  }
}

async function importPassEntryJson() {
  assert(argValues['pass-entry-json'], 'Missing required --pass-entry-json argument');
  const passEntryJson = require(path.resolve(argValues['pass-entry-json']));

  const commitHashBeforeImport = (await exec(`pass git rev-parse --short HEAD`)).stdout.trim();
  console.log(
    `Here is the commit hash of the pass repo before we do anything: ${commitHashBeforeImport}\n` +
      `If you want to revert this import, you can run the following command:\n` +
      chalk.grey(`\`\`\`\n` + `pass git reset --hard ${commitHashBeforeImport}\n` + `\`\`\`\n`) +
      `If you've already pushed and synchronized the repo remotely, you can gracefully revert this import by undoing all of the changes in a new single commit:\n` +
      chalk.grey(
        `\`\`\`\n` +
          `pass git revert --no-commit ${commitHashBeforeImport}..HEAD\n` +
          `pass git commit\n` +
          `\`\`\`\n`,
      ),
  );

  console.log(
    `Inserting ${Object.keys(passEntryJson).length} entries from ${argValues['pass-entry-json']}`,
  );
  for (const [entryPath, passEntry] of Object.entries(passEntryJson)) {
    await insertPassEntry(entryPath, passEntry);
  }

  console.log(
    `Inserted ${Object.keys(passEntryJson).length} entries from ${argValues['pass-entry-json']} ✅`,
  );
}

importPassEntryJson();
