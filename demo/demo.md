## Demo setup

Install [`asciiinema`](https://asciinema.org/).

We're using the [`itsalive`](https://gitlab.com/stavros/itsalive) tool to run the series
of commands in the demo. This way we can demo quickly without any typos.

Press `Ctrl + d` to exit `itsalive`. Also happens to be the same keyboard shortcut to exit
`asciiinema` recording.

```sh
$ git clone git@gitlab.com:stavros/itsalive.git
$ cd itsalive
$ poetry install
$ poetry shell
$ cd ~/Documents/github/pass-import-chrome
$ itsalive demo/itsalive-commands.txt
# Start typing and watch the magic happen.
# The terminal output might look messed up while typing because we're constraining the asc but
# the recorded cast and final SVG seem to be fine.
```

Convert the `asciinema` recording to an SVG that we embed in the README.

```sh
$ npm install svg-term-cli --global
$ cat demo/demo.cast | svg-term --out demo/demo.svg --window
```

Note: For the actual SVG file, we use a fork of `svg-term` with some
[fixes](https://github.com/marionebl/svg-term/pull/43).

Upload `demo/demo.svg` to a gist and use the raw URL in the README.

## Dev notes

- Alternative terminal command typing replay: [`doitlive`](https://github.com/sloria/doitlive)
  - As discussed in https://github.com/asciinema/asciinema/issues/393
