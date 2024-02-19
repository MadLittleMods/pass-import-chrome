# Google Chrome to `pass` Password Store Importer

This project is a tool to import your Google Chrome passwords into `pass` password
store. The scripts are fairly simple and should be easy to modify to fit your needs.

If you're unfamiliar with [zx2c4's `pass` (Password Store)](https://www.passwordstore.org/), see this [introductory video](https://www.youtube.com/watch?v=FhwsfH2TpFA).

## Setup

Install [Node.js](https://nodejs.org/) (tested with Node.js `v20.11.0`)

```sh
$ git clone git@github.com:MadLittleMods/pass-import-chrome.git
$ cd pass-import-chrome
$ npm install
```

## Tool usage

### Step #1: Export Chrome passwords to a CSV file

Instructions: **Chrome** -> **Settings** -> **Autofill and passwords** -> **Google password manager** -> **Settings** -> **Export passwords** -> **Download file**

Or you can simply visit `chrome://password-manager/settings` and **Export passwords** -> **Download file**

This will give you a `Chrome Passwords.csv` file.

### Step #2: Generate `pass` entry JSON from Chrome CSV

This is an interactive script that will prompt you to resolve conflicts and provide
aliases where there are multiple logins for the same domain.

(feel free just to try it out with the dummy data in `test/dummy-chrome-passwords.csv`)

```sh
FORCE_COLOR=1 node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv > ./chrome-pass-entries.json
```

You can also provide `--login-alias-json` file to preload the list of suggested aliases
to resolve conflicts. The script will also spit out an updated alias list when you're
finished or decide to bail early to use in the next run.

```sh
FORCE_COLOR=1 node generate-pass-entry-json-from-chrome-csv.js --chrome-csv test/dummy-chrome-passwords.csv --login-alias-json login-aliases.json  > ./chrome-pass-entries.json
```

### Step #3: Import `pass` entry JSON into `pass` password store

```sh
node import-pass-entry-json.js --pass-entry-json chrome-pass-entries.json
```

Example `pass` entry output from this script below. There isn't a standard format for
`pass` entries but this tries to follow the conventions of the `pass` community and
should work with [`browserpass`](https://github.com/browserpass/browserpass-extension)
or [`passff`](https://github.com/passff/passff) browser extensions.

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

The script will also print out some git commands to revert the import process if you see anything wrong.

## FAQ

### How is this different from the alternative projects?

Both of the alternative projects put your login/email/username
(ex. `mail.google.com/personal@gmail.com.gpg`) in the file name which might be ok for you
(depending on your threat model) but is also a meta data leak. This project aims to only
include the host name (so
[`browserpass`](https://github.com/browserpass/browserpass-extension?tab=readme-ov-file#organizing-password-store)
still works) or your own alias like `personal`, `work`, etc in the file name
(ex. `mail.google.com/personal.gpg`)

- https://github.com/roddhjav/pass-import
- https://gist.github.com/rounakdatta/eb6d0f13817eed56ac98b4f776f49428

### Why two separate commands?

So you can first generate the `chrome-pass-entries.json` file and manually review it before
importing everything to your password store.

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
data we're trying to pipe. Arguments for the script itself should be passed after `--` (see below).

```sh
npm run generate-pass-entry-json-from-chrome-csv --silent -- --chrome-csv test/dummy-chrome-passwords.csv
```
