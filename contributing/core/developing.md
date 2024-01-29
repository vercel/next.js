# Developing

- The development branch is `canary`.
- All pull requests should be opened against `canary`.
- The changes on the `canary` branch are published to the `@canary` tag on npm regularly.

To develop locally:

1. Install Rust and Cargo via [rustup](https://rustup.rs).
1. Install the [GitHub CLI](https://github.com/cli/cli#installation).
1. Clone the Next.js repository (download only recent commits for faster clone):
   ```
   gh repo clone vercel/next.js -- --depth=3000 --branch canary --single-branch
   ```
1. Create a new branch:
   ```
   git checkout -b MY_BRANCH_NAME origin/canary
   ```
1. Enable pnpm:
   ```
   corepack enable pnpm
   ```
1. Install the dependencies with:
   ```
   pnpm install
   ```
1. Start developing and watch for code changes:
   ```
   pnpm dev
   ```
1. In a new terminal, run `pnpm types` to compile declaration files from
   TypeScript.
   _Note: You may need to repeat this step if your types get outdated._
1. When your changes are finished, commit them to the branch:
   ```
   git add .
   git commit -m "DESCRIBE_YOUR_CHANGES_HERE"
   ```
1. To open a pull request you can use the GitHub CLI which automatically forks and sets up a remote branch. Follow the prompts when running:
   ```
   gh pr create
   ```

For instructions on how to build a project with your local version of the CLI,
see **[Developing Using Your Local Version of Next.js](./developing-using-local-app.md)** as linking the package is not sufficient to develop locally.
