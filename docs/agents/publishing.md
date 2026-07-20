# Maintainer publication

The publication target is exactly the public repository
`dayhaysoos/packwalk`. These instructions describe the maintainer environment;
they are not a requirement that outside contributors reproduce its credential
layout.

## Preflight

From the PackWalk checkout, verify:

```sh
git rev-parse --show-toplevel
git branch --show-current
git remote get-url origin
git status --short --branch
gh-day api user --jq .login
```

When an agent's non-interactive shell does not load the helper functions, invoke
the same helpers through the configured interactive zsh environment:

```sh
zsh -ic 'gh-day api user --jq .login'
```

The branch must be the intended branch, the remote must identify
`dayhaysoos/packwalk`, and `gh-day` must report `dayhaysoos` before publication.

Use the public commit identity:

```text
Nick DeJesus <1852675+dayhaysoos@users.noreply.github.com>
```

Verify both author and committer metadata after committing.

## Push

Push through the configured maintainer helper:

```sh
git-day push origin main
```

For a non-interactive agent shell, the equivalent helper invocation is:

```sh
zsh -ic 'git-day push origin main'
```

Do not use bare `gh`, ordinary cached Git credentials, `--all`, `--mirror`, or
another account as a fallback. If `gh-day` or `git-day` is unavailable or does
not identify `dayhaysoos`, stop and ask the maintainer to repair the configured
path.

Keep `.scratch` as the versioned issue tracker; publishing does not create
GitHub Issues.
