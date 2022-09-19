# Triaging

Repository maintainers triage every issue and PR opened in the repository.

Issues are opened with one of these labels:

- `template: story` - a feature request, converted to an [💡 Ideas discussion](https://github.com/vercel/next.js/discussions/categories/ideas)
- `template: bug` - unverified issue with Next.js itself, or one of the examples in the [`examples`](https://github.com/vercel/next.js/tree/canary/examples) folder
- `template: documentation` - feedback for improvement or an unverified issue with the Next.js documentation

In the case of a bug report, a maintainer looks at the provided reproduction. If the reproduction is missing or insufficient, a `please add a complete reproduction` label is added. If a reproduction is not provided for more than 30 days, the issue becomes stale and will be automatically closed. If a reproduction is provided within 30 days, the `please add a complete reproduction` label is removed and the issue will not become stale anymore.

Bug reports must be verified against the `next@canary` release. The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. Think of canary as a public beta. Some issues may already be fixed in the canary version, so please verify that your issue reproduces before opening a new issue. Issues not verified against `next@canary` will be closed after 30 days.

If the issue is specific to the project and not to Next.js itself, it might be converted to a [🎓️ Help discussion](https://github.com/vercel/next.js/discussions/categories/help)

If the bug is verified, it will receive the `kind: bug` label and will be tracked by the maintainers. An `area:` label can be added to indicate which part of Next.js is affected.

Confirmed issues never become stale or are closed before resolution.

All **closed** PRs and Issues will be locked after 30 days of inactivity (eg.: comment, referencing from elsewhere).
