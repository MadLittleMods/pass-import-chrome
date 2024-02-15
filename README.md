```sh
node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv
```

You can also provide `--login-alias-json` file to preload the list of suggested aliases
to resolve conflicts.

```sh
node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json
```

```
npm run generate-pass-entry-json-from-chrome-csv --silent -- --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json
```

## FAQ

### Why two separate commands?

So you can first generate the `chrome-pass-entries.json` file and manually review it before
adding it to your password store.

## Piping/composing with other commands

```sh
npm start --silent -- --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json | jq .
```

- `--silent` is necessary to suppress the `npm` run command output to `stdout` which
  messes with data we're trying to pipe

By default, we always enable color text output (even when piping). If you want to
disable it, set the `FORCE_COLOR=0` environment variable (this option comes from
[`chalk`](https://github.com/chalk/chalk/tree/v4.1.2?tab=readme-ov-file#chalksupportscolor)).
