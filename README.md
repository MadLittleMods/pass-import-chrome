# Google Chrome to `pass` Password Store Importer

If you're unfamiliar with [zx2c4's `pass`](https://www.passwordstore.org/), see this [introductory video](https://www.youtube.com/watch?v=FhwsfH2TpFA).

```sh
node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv
```

You can also provide `--login-alias-json` file to preload the list of suggested aliases
to resolve conflicts.

```sh
node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json
```

```sh
node import-pass-entry-json.js --pass-entry-json chrome-pass-entries.json
```

Example `pass` entry output from this script:

```
<password>
login: <login>
email: <email>
username: <username>
url: <url>
url: <url>
url: <url>
comments: <comments>
```

## FAQ

### How is this different from the alternative projects?

Both of the alternative projects put your login/email/username
(ex. `mail.google.com/personal@gmail.com.gpg`) in the file name which might be ok for you
(depending on your threat model) but is also a meta data leak. This project aims to only
include the host name (so
[`browserpass`](https://github.com/browserpass/browserpass-extension?tab=readme-ov-file#organizing-password-store)
still works) or your own alias like `work`, `personal`, etc in the file name
(ex. `mail.google.com/personal.gpg`)

- https://github.com/roddhjav/pass-import
- https://gist.github.com/rounakdatta/eb6d0f13817eed56ac98b4f776f49428

### Why two separate commands?

So you can first generate the `chrome-pass-entries.json` file and manually review it before
adding it to your password store.

### Piping/composing with other commands

`FORCE_COLOR=1` is necessary to force color text output when piping (this option comes
from
[`chalk`](https://github.com/chalk/chalk/tree/v4.1.2?tab=readme-ov-file#chalksupportscolor)).
This is because when piping, the stdout/stderr that the program is outputting to isn't
considered an interactive terminal (TTY) where color is supported so it needs to be forced.

```sh
FORCE_COLOR=1 node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json | jq .
```

When using `npm run <command>` instead of calling the scripts directly, `--silent` is
necessary to suppress the default `npm` run command output to `stdout` which messes with
data we're trying to pipe.

```sh
npm run generate-pass-entry-json-from-chrome-csv --silent -- --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json
```
