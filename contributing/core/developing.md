# Developing

The development branch is `canary`. This is the branch that all pull
requests should be made against. The changes on the `canary`
branch are published to the `@canary` tag on npm regularly.

To develop locally:

1. [Fork](https://help.github.com/articles/fork-a-repo/) this repository to your
   own GitHub account and then
   [clone](https://help.github.com/articles/cloning-a-repository/) it to your local device.

   If you don't need the whole git history, you can clone with depth 1 to reduce the download size (~1.6GB):

   ```sh
   git clone --depth=1 https://github.com/vercel/next.js
   ```

2. Create a new branch:
   ```
   git checkout -b MY_BRANCH_NAME
   ```
3. Enable pnpm:
   ```
   corepack enable pnpm
   ```
4. Install the dependencies with:
   ```
   pnpm install
   ```
5. Start developing and watch for code changes:
   ```
   pnpm dev
   ```
6. In a new terminal, run `pnpm types` to compile declaration files from
   TypeScript.

   _Note: You may need to repeat this step if your types get outdated._

For instructions on how to build a project with your local version of the CLI,
see **[Developing with your local version of Next.js](#developing-with-your-local-version-of-nextjs)**
below. (Naively linking the binary is not sufficient to develop locally.)
