// @ts-check
import * as github from '@actions/github'
import * as core from '@actions/core'

const verifyCanaryLabel = 'please verify canary'
const addReproductionLabel = 'please add a complete reproduction'

/**
 * @typedef {{
 *  id :number
 *  node_id :string
 *  url :string
 *  name :string
 *  description :string
 *  color :string
 *  default :boolean
 * }} Label
 */

async function run() {
  try {
    const { payload, repo } = github.context
    const { issue, pull_request } = payload

    if (pull_request || !issue?.body || !process.env.GITHUB_TOKEN) return

    /** @type {Label} */
    const newLabel = payload.label
    const { body, number: issueNumber } = issue
    const client = github.getOctokit(process.env.GITHUB_TOKEN).rest
    const issueCommon = { ...repo, issue_number: issueNumber }

    /** @param {string|null} link */
    async function hasRepro(link) {
      if (!link) return false
      try {
        new URL(link)
      } catch {
        return false
      }
      if (['example.com'].includes(link)) return false
      const response = await fetch(link)
      if (!response.ok) return false
    }

    const hasValidRepro = await hasRepro(
      body
        .toLowerCase()
        .match(/will be addressed faster\n\n(.*)\n\n### To Reproduce/)?.[1]
    )

    if (!hasValidRepro || newLabel.name === addReproductionLabel) {
      await client.issues.createComment({
        ...issueCommon,
        body: `We cannot recreate the issue with the provided information. **Please add a reproduction in order for us to be able to investigate.**

### **Why was this issue marked with the \`please add a complete reproduction\` label?**

To be able to investigate, we need access to a reproduction to identify what triggered the issue. We prefer a link to a public GitHub repository ([template](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template)), but you can also use a tool like [CodeSandbox](https://codesandbox.io/s/github/vercel/next.js/tree/canary/examples/reproduction-template) or [StackBlitz](https://stackblitz.com/fork/github/vercel/next.js/tree/canary/examples/reproduction-template).

To make sure the issue is resolved as quickly as possible, please make sure that the reproduction is as **minimal** as possible. This means that you should **remove** all **unnecessary code, files, and dependencies** that do not contribute to the issue.

Please test your reproduction against the latest version of Next.js (\`next@canary\`) to make sure your issue has not already been fixed.

### **I added a link, why was it still marked?**

Ensure the link is pointing to a codebase that is accessible (e.g. not a private repository). "[example.com](http://example.com/)", "n/a", "will add later", etc. are not acceptable links -- we need to see a public codebase. See the above section for accepted links.

### **What happens if I don't provide a sufficient minimal reproduction?**

Issues with the \`please add a complete reproduction\` label that receives no meaningful activity (e.g. new comments with a reproduction link) are automatically closed and locked after 30 days.

If your issue has *not* been resolved in that time and it has been closed/locked, please open a new issue with the required reproduction.

### **I did not open this issue, but it is relevant to me, what can I do to help?**

Anyone experiencing the same issue is welcome to provide a minimal reproduction (following the above steps). Furthermore, you can upvote the issue (using the :+1: reaction on the topmost comment, instead of commenting "I have the same issue" etc.). Then, we can sort issues by engagement to prioritize.

### **I think my reproduction is good enough, why aren't you looking into it quicker?**

We look into every Next.js issue and constantly monitor open issues for new comments.

However, sometimes we might miss one or two due to the popularity/high traffic of the repository. We apologize, and kindly ask you to refrain from tagging core maintainers, as that will usually not result in increased priority.

Upvoting issues to show your interest will help us prioritize and address them as quickly as possible. That said, every issue is important to us, and if an issue gets closed by accident, we encourage you to open a new one linking to the old issue and we will look into it.

### **Useful Resources**

-   [How to Contribute to Open Source (Next.js)](https://www.youtube.com/watch?v=cuoNzXFLitc)
-   [How to create a Minimal, Complete, and Verifiable example](https://stackoverflow.com/help/mcve)
-   [Reporting a Next.js bug](https://github.com/vercel/next.js/blob/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml)
-   [Next.js Triaging issues](https://github.com/vercel/next.js/blob/canary/contributing/repository/triaging.md)`,
      })
      return core.info(
        'Commented on issue, because it did not have a sufficient reproduction.'
      )
    }

    const isVerifyCanaryChecked = body
      .toLowerCase()
      .includes(
        '- [x] i verified that the issue exists in next.js canary release'
      )

    if (!isVerifyCanaryChecked || newLabel.name === verifyCanaryLabel) {
      await client.issues.createComment({
        ...issueCommon,
        body: `Please verify that your issue can be recreated with \`next@canary\`.

### **Why was this issue marked with the \`please verify canary\` label?**

We noticed the provided reproduction was using an older version of Next.js, instead of \`canary\`.

The canary version of Next.js ships daily and includes all features and fixes that have not been released to the stable version yet. You can think of canary as a *public beta*. Some issues may already be fixed in the canary version, so please verify that your issue reproduces by running \`npm install next@canary\` and test it in your project, using your reproduction steps.

If the issue does not reproduce with the \`canary\` version, then it has already been fixed and this issue can be closed.

### **How can I quickly verify if my issue has been fixed in \`canary\`?**

The safest way is to install \`next@canary\` in your project and test it, but you can also search through [closed Next.js issues](https://github.com/vercel/next.js/issues?q=is%3Aissue+is%3Aclosed) for duplicates or check the [Next.js releases](https://github.com/vercel/next.js/releases).

### **My issue has been open for a long time, why do I need to verify \`canary\` now?**

Next.js does not backport bug fixes to older versions of Next.js. Instead, we are trying to introduce only a minimal amount of breaking changes between major releases.

### **What happens if I don't verify against the canary version of Next.js?**

An issue with the \`please verify canary\` that receives no meaningful activity (e.g. new comments that acknowledge verification against \`canary\`) will be automatically closed and locked after 30 days.

If your issue has not been resolved in that time and it has been closed/locked, please open a new issue, with the required reproduction, using \`next@canary\`.

### **I did not open this issue, but it is relevant to me, what can I do to help?**

Anyone experiencing the same issue is welcome to provide a minimal reproduction (following the above steps). Furthermore, you can upvote the issue (using the :+1: reaction on the topmost comment, instead of commenting "I have the same issue" etc.). Then, we can sort issues by engagement to prioritize.

### **I think my reproduction is good enough, why aren't you looking into it quicker?**

We look into every Next.js issue and constantly monitor open issues for new comments.

However, sometimes we might miss one or two due to the popularity/high traffic of the repository. We apologize, and kindly ask you to refrain from tagging core maintainers, as that will usually not result in increased priority.

Upvoting issues to show your interest will help us prioritize and address them as quickly as possible. That said, every issue is important to us, and if an issue gets closed by accident, we encourage you to open a new one linking to the old issue and we will look into it.

### **Useful Resources**

-   [How to Contribute to Open Source (Next.js)](https://www.youtube.com/watch?v=cuoNzXFLitc)
-   [How to create a Minimal, Complete, and Verifiable example](https://stackoverflow.com/help/mcve)
-   [Reporting a Next.js bug](https://github.com/vercel/next.js/blob/canary/.github/ISSUE_TEMPLATE/1.bug_report.yml)
-   [Next.js Triaging issues](https://github.com/vercel/next.js/blob/canary/contributing/repository/triaging.md)`,
      })
      return core.info(
        'Commented on issue, because it was not verified against canary.'
      )
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
