---
name: bk-axi
description: "Operate Buildkite through the bk-axi CLI - builds, jobs, logs, blocked steps, pipelines, and auth status. Use for checking CI, monitoring builds to blocked or terminal states, unblocking steps, reading Buildkite logs, triggering builds, rebuilding builds, or discovering pipelines."
user-invocable: false
metadata:
  hermes:
    tags: [buildkite, ci, pipelines, logs]
    category: devops
---

# bk-axi

Agent ergonomic wrapper around Buildkite CLI. Prefer this over raw `bk` for Buildkite operations from agents.

You do not need bk-axi installed globally - invoke it with `npx -y bk-axi <command>`.
If bk-axi output shows a follow-up command starting with `bk-axi`, run it as `npx -y bk-axi ...` instead.

bk-axi requires the official `bk` CLI installed and authenticated. If authentication fails, ask the user to run `bk configure --org <org> --token "$BUILDKITE_API_TOKEN" --no-input` or `bk auth login`.

## When to use

Use bk-axi whenever a task touches Buildkite: listing builds, viewing build jobs, monitoring a build until it is blocked, passed, or failed, listing blocked jobs, unblocking manual steps, reading job logs, triggering builds, rebuilding builds, cancelling builds or jobs, discovering pipelines, or checking Buildkite auth status.

## Workflow

1. Run `npx -y bk-axi` with no arguments for a compact dashboard of visible recent builds and pipelines.
2. Discover pipeline slugs with `pipeline list`, then scope build commands with `--pipeline <pipeline>`.
3. Debug CI with `build list --state failed`, then `build view <number> --pipeline <pipeline>`, then `job log <job-id>`.
4. Monitor progress with `build wait <number> --pipeline <pipeline>`; it stops when the build reaches a blocked step or a terminal passed/failed/canceled state.
5. Find manual gates with `job list --state blocked --pipeline <pipeline>`, then unblock one with `job unblock <job-id> --data '<json>'`.
6. Trigger a build with `build create --pipeline <pipeline> --branch <branch>`.
7. Rebuild a Buildkite build with `build rebuild <number> --pipeline <pipeline>`; Buildkite does not have `build retry`.

## Commands

```
commands[6]:
  (none)=dashboard, build, job, pipeline, auth, setup
```

Run `npx -y bk-axi --help` for global flags, or `npx -y bk-axi <command> --help` for per-command usage.

## Tips

- Output is TOON-encoded and token-efficient.
- Errors are structured on stdout with exit code 2 for usage problems.
- Long job logs are truncated by default and include a temp `full_log` path when saved.
- Use `build wait` instead of raw `build watch` when an agent needs structured state and should stop at blocked gates as well as pass/fail outcomes.
- Do not use `bk use` from automation because it can become interactive; pass explicit `--pipeline` and `--org` flags instead.
