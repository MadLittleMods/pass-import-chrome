## Piping/composing with other commands

```
FORCE_COLOR=1 npm start --silent -- --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json | jq .
```

- `--silent` is necessary to suppress the `npm` output to `stdout` which messes with
  data we're trying to pipe
- `FORCE_COLOR=1` is necessary when piping in order to preserve color output (this
  option comes from
  [`chalk`](https://github.com/chalk/chalk/tree/v4.1.2?tab=readme-ov-file#chalksupportscolor))
