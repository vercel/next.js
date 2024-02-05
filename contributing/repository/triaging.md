# Triaging

Repository maintainers triage every issue and PR opened in the repository.

> Note: Feature requests should be opened as discussions, filling out [this template](https://github.com/vercel/next.js/discussions/new?category=ideas).

Issues are opened with one of these labels:

- `template: bug` - unverified issue with Next.js itself
- `template: documentation` - feedback for improvement or an unverified issue with the Next.js documentation
- `area: examples` - an issue with one of the examples in the [`examples`](https://github.com/vercel/next.js/tree/canary/examples) folder

## Bug reports

### Automated triaging

In case of a bug report, **if the reproduction is missing or insufficient, the issue is automatically closed**, and a comment is added with a correct course of action. The issue will receive [this comment](https://github.com/vercel/next.js/blob/canary/.github/invalid-link.md). We also add an `invalid link` label to mark the issue. To avoid your issue being closed, please follow the [bug report template](https://github.com/vercel/next.js/blob/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml) carefully.

If you filled out the "Which area(s) are affected? (Select all that apply)" section of the bug report template, we will add the corresponding `area:` label(s).

### Manual triaging

If the issue is specific to the project and not to Next.js itself, it will be converted to a [🎓️ Help discussion](https://github.com/vercel/next.js/discussions/categories/help)

A maintainer can also manually label an issue with one of the following labels, which will also add a comment with a correct course of action:

1. `please add a complete reproduction`

The provided reproduction is not enough for the maintainers to investigate. If a sufficient reproduction is not provided for more than 30 days, the issue becomes stale and will be automatically closed. If a reproduction is provided within 30 days, a `needs triage` label is added, indicating that the issue needs another look from a maintainer.

The issue will receive [this comment](https://github.com/vercel/next.js/blob/canary/.github/comments/invalid-reproduction.md)

2. `please verify canary`

The issue is not verified against the `next@canary` release. The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta. Some issues may already be fixed in the canary version, so please verify that your issue reproduces before opening a new issue. Issues not verified against `next@canary` will be closed after 30 days.

The issue will receive [this comment](https://github.com/vercel/next.js/blob/canary/.github/comments/verify-canary.md)

3. `please simplify reproduction`

The provided reproduction is too complex or requires too many steps to reproduce. If a simplified reproduction is not provided for more than 30 days, the issue becomes stale and will be automatically closed. If a reproduction is provided within 30 days, a `needs triage` label is added, indicating that the issue needs another look from a maintainer.
The issue will receive [this comment](https://github.com/vercel/next.js/blob/canary/.github/comments/simplify-reproduction.md)

4. `good first issue`

The issue is considered beginner-friendly enough to be a good starting point for someone new to the project who wants to contribute.
The issue will receive [this comment](https://github.com/vercel/next.js/blob/canary/.github/comments/good-first-issue.md)

5. `resolved`

We assume that a newer version of Next.js fixed the issue. If the issue is still relevant, please open a new issue and reference the old one.
The issue will receive [this comment](https://github.com/vercel/next.js/blob/canary/.github/comments/resolved.md)

## Verified issues

If an issue is verified, it will receive the `linear: next`, `linear: dx` or `linear: web` label and will be tracked by the maintainers. Additionally, one or more `area:` label(s) can be added to indicate which part of Next.js is affected.

Confirmed issues never become stale or are closed before resolution.

## Closed issues

All **closed** PRs and Issues will be locked after 2 weeks of inactivity (eg.: comment, referencing from elsewhere). If you think the issue is still relevant, please open a new issue and reference the old one.
