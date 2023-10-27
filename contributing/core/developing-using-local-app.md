# Developing Using Your Local Version of Next.js

There are two options to develop with your local version of the codebase:

## Develop inside the monorepo

This will use the version of `next` built inside of the Next.js monorepo. You can also let `pnpm dev` run in a separate terminal. This will let you make changes to Next.js at the same time (note that some changes might require re-running `pnpm next-with-deps` or `pnpm next`).

If your app does not have dependencies, you can create a directory inside the monorepo (eg.: `dev-app`) and run `pnpm next ./dev-app` without creating a `package.json` file.

If you already have an app and it has dependencies, you can follow these steps:

1. Move your app inside of the Next.js monorepo.

2. Run with `pnpm next-with-deps ./app-path-in-monorepo`

## Set as a local dependency in package.json

1. Run `pnpm dev` in the background in the Next.js monorepo.

2. In your app's root directory, run:

   ```sh
   pnpm add ./path/to/next.js/{packages/next,node_modules/{react,react-dom}}
   ```

   to re-install all of the dependencies and point `next`, `react` and `react-dom` to the monorepo versions.

   Note that Next.js will be copied from the locally compiled version as opposed to being downloaded from the NPM registry.

3. Run your application as you normally would.

### Troubleshooting

- If you see the below error while running `pnpm dev` with `next`:

```
Failed to load SWC binary, see more info here: https://nextjs.org/docs/messages/failed-loading-swc
```

Try to add the below section to your `package.json`, then run again

```json
{
  "optionalDependencies": {
    "@next/swc-linux-x64-gnu": "canary",
    "@next/swc-win32-x64-msvc": "canary",
    "@next/swc-darwin-x64": "canary",
    "@next/swc-darwin-arm64": "canary"
  }
}
```
