name: Bug Report
description: Create a bug report for the Next.js core
labels: ['template: bug']
body:
  - type: markdown
    attributes:
      value: |
        *Note:* If you leave out sections, the issue might be moved to the ["Help" section](https://github.com/vercel/next.js/discussions/categories/help).
        [examples](https://github.com/vercel/next.js/tree/canary/examples) related issue should be reported using [this](https://github.com/vercel/next.js/issues/new?assignees=&labels=type%3A+example%2Ctemplate%3A+bug&template=2.example_bug_report.yml) issue template instead.
        Feature requests should be opened as [discussions](https://github.com/vercel/next.js/discussions/new?category=ideas). [Read more](https://github.com/vercel/next.js/blob/canary/contributing/core/adding-features.md).
  - type: checkboxes
    attributes:
      label: Verify canary release
      description: 'Please run `npm install next@canary` to try the canary version of Next.js that ships daily. It includes all features and fixes that have not been released to the stable version yet. Some issues may already be fixed in the canary version, so please verify that your issue reproduces before opening a new issue.'
      options:
        - label: I verified that the issue exists in the latest Next.js canary release
          required: true
  - type: textarea
    attributes:
      label: Provide environment information
      description: Please run `next info` in the root directory of your project and paste the results. You might need to use `npx --no-install next info` if next is not in the current PATH.
      render: bash
    validations:
      required: true
  - type: dropdown
    attributes:
      label: Which area(s) of Next.js are affected? (leave empty if unsure)
      multiple: true
      options:
        - 'App directory (appDir: true)'
        - 'CLI (create-next-app)'
        - 'Data fetching (gS(S)P, getInitialProps)'
        - 'Dynamic imports (next/dynamic)'
        - 'ESLint (eslint-config-next)'
        - 'Font optimization (next/font)'
        - 'Image optimization (next/image, next/legacy/image)'
        - 'Internationalization (i18n)'
        - 'Jest (next/jest)'
        - 'MDX (@next/mdx)'
        - 'Metadata (metadata, generateMetadata, next/head, head.js)'
        - 'Middleware / Edge (API routes, runtime)'
        - 'Operating System (Windows, MacOS, Linux)'
        - 'Package manager (npm, pnpm, Yarn)'
        - 'Routing (next/router, next/navigation, next/link)'
        - 'Script optimization (next/script)'
        - 'Standalone mode (output: "standalone")'
        - 'Static HTML Export (output: "export")'
        - 'SWC minifier (swcMinify: true)'
        - 'SWC transpilation'
        - 'Turbopack (--turbo)'
        - 'TypeScript (plugin, built-in types)'
  - type: input
    attributes:
      label: Link to the code that reproduces this issue or a replay of the bug
      description: |
        A link to a [GitHub repository](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template) or a [CodeSandbox](https://codesandbox.io/p/sandbox/github/vercel/next.js/tree/canary/examples/reproduction-template) minimal reproduction. Minimal reproductions should be created from our [bug report template with `npx create-next-app -e reproduction-template`](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template) and should include only changes that contribute to the issue.
        If a minimal reproduction can't be created please share a [replay](https://www.replay.io/) of the bug which doesn't require sharing a private repo.
        To report an App Router related issue, you can use these templates: [CodeSandbox](https://codesandbox.io/p/sandbox/github/vercel/next.js/tree/canary/examples/reproduction-template-app-dir) or [`npx create-next-app -e reproduction-template-app-dir`](https://github.com/vercel/next.js/tree/canary/examples/reproduction-template-app-dir)
    validations:
      required: true
  - type: textarea
    attributes:
      label: To Reproduce
      description: Steps to reproduce the behavior, please provide a clear description of how to reproduce the issue, based on the linked minimal reproduction. Screenshots can be provided in the issue body below. If using code blocks, make sure that [syntax highlighting is correct](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-and-highlighting-code-blocks#syntax-highlighting) and double check that the rendered preview is not broken.
    validations:
      required: true
  - type: textarea
    attributes:
      label: Describe the Bug
      description: A clear and concise description of what the bug is.
    validations:
      required: true
  - type: textarea
    attributes:
      label: Expected Behavior
      description: A clear and concise description of what you expected to happen.
    validations:
      required: true
  - type: markdown
    attributes:
      value: Before posting the issue go through the steps you've written down to make sure the steps provided are detailed and clear.
  - type: markdown
    attributes:
      value: Contributors should be able to follow the steps provided in order to reproduce the bug.
  - type: markdown
    attributes:
      value: These steps are used to add integration tests to ensure the same issue does not happen again. Thanks in advance!
  - type: input
    attributes:
      label: Which browser are you using? (if relevant)
      description: 'Please specify the exact version. For example: Chrome 100.0.4878.0'
  - type: input
    attributes:
      label: How are you deploying your application? (if relevant)
      description: 'For example: next start, Vercel, Other platform'
