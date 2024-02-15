```sh
node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv
```

You can also provide `--login-alias-json` file to preload the list of suggested aliases
to resolve conflicts.

```sh
node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json
```

## FAQ

### Why two separate commands?

So you can first generate the `chrome-pass-entries.json` file and manually review it before
adding it to your password store.

## Piping/composing with other commands

`FORCE_COLOR=1` is necessary to force color output when piping (this option comes from
[`chalk`](https://github.com/chalk/chalk/tree/v4.1.2?tab=readme-ov-file#chalksupportscolor)).

```sh
FORCE_COLOR=1 node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json | jq .
```

When using `npm run <command>`, `--silent` is necessary to suppress the `npm` run
command output to `stdout` which messes with data we're trying to pipe.

```sh
npm run generate-pass-entry-json-from-chrome-csv --silent -- --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json
```
