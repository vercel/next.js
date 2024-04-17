We cannot easily recreate the issue with the provided information. Please add a **minimal** reproduction in order for us to be able to help more efficiently.

### Why was this issue marked with the `please simplify reproduction` label?

There was a reproduction provided, but due to its complexity, we cannot easily reproduce the issue.

An ideal minimal reproduction (_unless relevant_):

- is not part of a monorepo
- does not require secrets to run
- does not reference private registry dependencies
- has as few dependencies as possible
- excludes unrelated pages/routes
- does not require a database/third-party service to run
- only includes the code necessary to reproduce the issue
- is tested against `next@canary` to make sure your issue has not already been fixed

**In general, assume that we should not go through a lengthy onboarding process at your company code only to be able to verify an issue.**

If you cannot create a clean reproduction, another way you can help the maintainers' job is to pinpoint the `canary` version of `next` that introduced the issue. Check out our [releases](https://github.com/vercel/next.js/releases), and try to find the first `canary` release that introduced the issue. This will help us narrow down the scope of the issue, and possibly point to the PR/code change that introduced it. You can install a specific version of `next` by running `npm install next@<version>`.

### What happens if I don't provide a sufficient minimal reproduction?

Issues with the `please simplify reproduction` label that receive no meaningful activity (e.g. new comments with a simplified reproduction link) are automatically closed and locked after 30 days.

If your issue has _not_ been resolved in that time and it has been closed/locked, please open a new issue with the required reproduction.

### I did not open this issue, but it is relevant to me, what can I do to help?

Anyone experiencing the same issue is welcome to provide a minimal reproduction following the above steps.

### I think my reproduction is good enough, why aren't you looking into it quicker?

We look into every Next.js issue and constantly monitor open issues for new comments.

However, sometimes we might miss one or two due to the popularity/high traffic of the repository. We apologize, and kindly ask you to refrain from tagging core maintainers, as that will usually not result in increased priority.

Providing a minimal reproduction from the start without asking helps us look into issues much more quickly, as we can easily verify if the reported bug is related to Next.js. That said, every issue is important to us, and if an issue gets closed by accident, we encourage you to open a new one linking to the old issue and we will look into it.

### Useful Resources

- [How to Contribute to Open Source (Next.js)](https://www.youtube.com/watch?v=cuoNzXFLitc)
- [How to create a Minimal, Complete, and Verifiable example](https://stackoverflow.com/help/mcve)
- [Reporting a Next.js bug](https://github.com/vercel/next.js/blob/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml)
- [Next.js Triaging issues](https://github.com/vercel/next.js/blob/canary/contributing/repository/triaging.md)
