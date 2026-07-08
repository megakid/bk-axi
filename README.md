# bk-axi

Agent ergonomic wrapper around the official Buildkite `bk` CLI.

`bk-axi` emits TOON on stdout, validates flags before invoking `bk`, suppresses interactive prompts, and returns structured errors that agents can act on.

## Install

After publication:

```sh
npm install -g bk-axi
bk-axi
```

Without a global install:

```sh
npx -y bk-axi
```

For local development:

```sh
npm install
npm run build
```

Run locally:

```sh
npm run dev -- build list --pipeline <pipeline>
```

## Examples

```sh
bk-axi
bk-axi build list --pipeline api --state failed
bk-axi build view 42 --pipeline api
bk-axi build wait 42 --pipeline api
bk-axi job list --state blocked --pipeline api
bk-axi job unblock <job-id> --data '{"release":"staging"}'
bk-axi job log <job-id>
bk-axi pipeline list
bk-axi setup hooks
```

## Agent Integration

Use the session hook for ambient Buildkite context:

```sh
bk-axi setup hooks
```

Or install the bundled skill as a lower-overhead on-demand path:

```sh
npx skills add megakid/bk-axi --skill bk-axi
```

The skill is generated from the same command guidance as the CLI:

```sh
npm run build:skill
npm run check:skill
```

## Publishing

Releases are managed by Release Please. Use conventional commits on `main`; the release workflow opens a release PR, and publishing to npm happens after that release PR is merged.

Configure npm Trusted Publishing for `megakid/bk-axi` before the first release, or add an `NPM_TOKEN` based publish path if trusted publishing is not available.
