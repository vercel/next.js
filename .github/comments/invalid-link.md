We could not detect a valid reproduction link. **Make sure to follow the bug report template carefully.**

### Why was this issue closed?

To be able to investigate, we need access to a reproduction to identify what triggered the issue. We need a link to a **public** GitHub repository ([template for App Router](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template), [template for Pages Router](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template-pages)), but you can also use these templates: [CodeSandbox: App Router](https://codesandbox.io/s/github/vercel/next.js/tree/canary/examples/reproduction-template) or [CodeSandbox: Pages Router](https://codesandbox.io/s/github/vercel/next.js/tree/canary/examples/reproduction-template-pages).

The bug template that you filled out has a section called "Link to the code that reproduces this issue", which is where you should provide the link to the reproduction.

- If you did not provide a link or the link you provided is not valid, we will close the issue.
- If you provide a link to a private repository, we will close the issue.
- If you provide a link to a repository but not in the correct section, we will close the issue.

### What should I do?

Depending on the reason the issue was closed, you can do the following:

- If you did not provide a link, please open a new issue with a link to a reproduction.
- If you provided a link to a private repository, please open a new issue with a link to a public repository.
- If you provided a link to a repository but not in the correct section, please open a new issue with a link to a reproduction in the correct section.

**In general, assume that we should not go through a lengthy onboarding process at your company code only to be able to verify an issue.**

### My repository is private and cannot make it public

In most cases, a private repo will not be a sufficient **minimal reproduction**, as this codebase might contain a lot of unrelated parts that would make our investigation take longer. Please do **not** make it public. Instead, create a new repository using the templates above, adding the relevant code to reproduce the issue. Common things to look out for:

- Remove any code that is not related to the issue. (pages, API routes, components, etc.)
- Remove any dependencies that are not related to the issue.
- Remove any third-party service that would require us to sign up for an account to reproduce the issue.
- Remove any environment variables that are not related to the issue.
- Remove private packages that we do not have access to.
- If the issue is not related to a monorepo specifically, try to reproduce the issue without a complex monorepo setup

### I did not open this issue, but it is relevant to me, what can I do to help?

Anyone experiencing the same issue is welcome to provide a minimal reproduction following the above steps by opening a new issue.

### I think my reproduction is good enough, why aren't you looking into it quickly?

We look into every Next.js issue and constantly monitor open issues for new comments.

However, sometimes we might miss one or two due to the popularity/high traffic of the repository. We apologize, and kindly ask you to refrain from tagging core maintainers, as that will usually not result in increased priority.

Upvoting issues to show your interest will help us prioritize and address them as quickly as possible. That said, every issue is important to us, and if an issue gets closed by accident, we encourage you to open a new one linking to the old issue and we will look into it.

### Useful Resources

- [How to Contribute to Open Source (Next.js)](https://www.youtube.com/watch?v=cuoNzXFLitc)
- [How to create a Minimal, Complete, and Verifiable example](https://stackoverflow.com/help/mcve)
- [Reporting a Next.js bug](https://github.com/vercel/next.js/blob/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml)
- [Next.js Triaging issues](https://github.com/vercel/next.js/blob/canary/contributing/repository/triaging.md)
