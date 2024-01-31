Please verify that your issue can be recreated with `next@canary`.

### Why was this issue marked with the `please verify canary` label?

We noticed the provided reproduction was using an older version of Next.js, instead of `canary`.

The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. You can think of canary as a _public beta_. Some issues may already be fixed in the canary version, so please verify that your issue reproduces by running `npm install next@canary` and test it in your project, using your reproduction steps.

If the issue does not reproduce with the `canary` version, then it has already been fixed and this issue can be closed.

### How can I quickly verify if my issue has been fixed in `canary`?

The safest way is to install `next@canary` in your project and test it, but you can also search through [closed Next.js issues](https://github.com/vercel/next.js/issues?q=is%3Aissue+is%3Aclosed) for duplicates or check the [Next.js releases](https://github.com/vercel/next.js/releases). You can also use the GitHub templates (preferred) for [App Router](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template) and [Pages Router](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template-pages), or the [CodeSandbox: App Router](https://codesandbox.io/s/github/vercel/next.js/tree/canary/examples/reproduction-template) or [CodeSandbox: Pages Router](https://codesandbox.io/s/github/vercel/next.js/tree/canary/examples/reproduction-template-pages) templates to create a reproduction with `canary` from scratch.

### My issue has been open for a long time, why do I need to verify `canary` now?

Next.js does not backport bug fixes to older versions of Next.js. Instead, we are trying to introduce only a minimal amount of breaking changes between major releases.

### What happens if I don't verify against the canary version of Next.js?

An issue with the `please verify canary` that receives no meaningful activity (e.g. new comments that acknowledge verification against `canary`) will be automatically closed and locked after 30 days.

If your issue has not been resolved in that time and it has been closed/locked, please open a new issue, with the required reproduction, using `next@canary`.

### I did not open this issue, but it is relevant to me, what can I do to help?

Anyone experiencing the same issue is welcome to provide a minimal reproduction following the above steps. Furthermore, you can upvote the issue using the :+1: reaction on the topmost comment (please **do not** comment "I have the same issue" without reproduction steps). Then, we can sort issues by votes to prioritize.

### I think my reproduction is good enough, why aren't you looking into it quicker?

We look into every Next.js issue and constantly monitor open issues for new comments.

However, sometimes we might miss one or two due to the popularity/high traffic of the repository. We apologize, and kindly ask you to refrain from tagging core maintainers, as that will usually not result in increased priority.

Upvoting issues to show your interest will help us prioritize and address them as quickly as possible. That said, every issue is important to us, and if an issue gets closed by accident, we encourage you to open a new one linking to the old issue and we will look into it.

### Useful Resources

- [How to Contribute to Open Source (Next.js)](https://www.youtube.com/watch?v=cuoNzXFLitc)
- [How to create a Minimal, Complete, and Verifiable example](https://stackoverflow.com/help/mcve)
- [Reporting a Next.js bug](https://github.com/vercel/next.js/blob/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml)
- [Next.js Triaging issues](https://github.com/vercel/next.js/blob/canary/contributing/repository/triaging.md)
