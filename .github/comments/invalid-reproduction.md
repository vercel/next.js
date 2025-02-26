We cannot recreate the issue with the provided information. **Please add a reproduction in order for us to be able to investigate.**

### Why was this issue marked with the `please add a complete reproduction` label?

To be able to investigate, we need access to a reproduction to identify what triggered the issue. We prefer a link to a public GitHub repository ([template for App Router](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template), [template for Pages Router](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template-pages)), but you can also use these templates: [CodeSandbox: App Router](https://codesandbox.io/s/github/vercel/next.js/tree/canary/examples/reproduction-template) or [CodeSandbox: Pages Router](https://codesandbox.io/s/github/vercel/next.js/tree/canary/examples/reproduction-template-pages).

To make sure the issue is resolved as quickly as possible, please make sure that the reproduction is as **minimal** as possible. This means that you should **remove unnecessary code, files, and dependencies** that do not contribute to the issue. Ensure your reproduction does not depend on secrets, 3rd party registries, private dependencies, or any other data that cannot be made public. Avoid a reproduction including a whole monorepo (unless relevant to the issue). The easier it is to reproduce the issue, the quicker we can help.

Please test your reproduction against the latest version of Next.js (`next@canary`) to make sure your issue has not already been fixed.

If you cannot create a clean reproduction, another way you can help the maintainers' job is to pinpoint the `canary` version of `next` that introduced the issue. Check out our [releases](https://github.com/vercel/next.js/releases), and try to find the first `canary` release that introduced the issue. This will help us narrow down the scope of the issue, and possibly point to the PR/code change that introduced it. You can install a specific version of `next` by running `npm install next@<version>`.

### I added a link, why was it still marked?

Ensure the link is pointing to a codebase that is accessible (e.g. not a private repository). "[example.com](http://example.com/)", "n/a", "will add later", etc. are not acceptable links -- we need to see a public codebase. See the above section for accepted links.

### What happens if I don't provide a sufficient minimal reproduction?

Issues with the `please add a complete reproduction` label that receives no meaningful activity (e.g. new comments with a reproduction link) are automatically closed and locked after **2** days.

If your issue has _not_ been resolved in that time and it has been closed/locked, please open a new issue with the required reproduction.

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
