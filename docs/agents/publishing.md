# Maintainer publication

The publication target is exactly the public repository
`dayhaysoos/packwalk`. These instructions describe the maintainer environment;
they are not a requirement that outside contributors reproduce its credential
layout.

## Authentication profile

Prefer the maintainer helpers when the current machine provides them:

```sh
zsh -ic 'gh-day api user --jq .login'
```

On another machine where `gh-day` and `git-day` are unavailable, the standard
GitHub CLI profile is supported after explicit identity verification:

```sh
gh auth status
gh api user --jq .login
```

The selected command must report exactly `dayhaysoos`. Never publish through a
different active account or assume that cached Git credentials belong to the
maintainer.

## Preflight

From the PackWalk checkout, verify:

```sh
git rev-parse --show-toplevel
git branch --show-current
git remote get-url origin
git status --short --branch
```

The branch must be the intended branch, the remote must identify
`dayhaysoos/packwalk`, and the selected GitHub authentication profile must report
`dayhaysoos` before publication.

Use the public commit identity:

```text
Nick DeJesus <1852675+dayhaysoos@users.noreply.github.com>
```

Verify both author and committer metadata after committing.

## Push with maintainer helpers

Push through the configured maintainer helper:

```sh
git-day push origin main
```

For a non-interactive agent shell, the equivalent helper invocation is:

```sh
zsh -ic 'git-day push origin main'
```

## Push with standard GitHub CLI authentication

After standard `gh` has been verified as `dayhaysoos`, push the intended branch
normally:

```sh
git push origin main
```

If Git is not using the verified GitHub CLI credentials, run `gh auth setup-git`,
repeat the identity preflight, and retry the one intended push. Do not use
`--all`, `--mirror`, another account, or unverified cached credentials.

Keep `.scratch` as the versioned issue tracker; publishing does not create
GitHub Issues.
