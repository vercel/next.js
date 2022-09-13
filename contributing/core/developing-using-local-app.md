# Developing Using Your Local Version of Next.js

There are two options to develop with your local version of the codebase:

## Develop inside the monorepo

1. Move your app inside of the Next.js monorepo.

2. Run with `pnpm next-with-deps ./app-path-in-monorepo`

This will use the version of `next` built inside of the Next.js monorepo and the
main `pnpm dev` monorepo command can be running to make changes to the local
Next.js version at the same time (some changes might require re-running `pnpm next-with-deps` to take effect).

## Set as a local dependency in package.json

1. In your app's `package.json`, replace:

   ```json
   "next": "<version>",
   "react": "<version>",
   "react-dom": "<version>",
   ```

   with:

   ```json
   "next": "link:/path/to/next.js/packages/next",
   "react": "link:/path/to/next.js/node_modules/react",
   "react-dom": "link:/path/to/next.js/node_modules/react-dom"
   ```

2. In your app's root directory, make sure to remove `next` from `node_modules` with:

   ```sh
   rm -rf ./node_modules/next
   ```

3. In your app's root directory, run:

   ```sh
   pnpm i
   ```

   to re-install all of the dependencies.

   Note that Next will be copied from the locally compiled version as opposed to being downloaded from the NPM registry.

4. Run your application as you normally would.

5. To update your app's dependencies, after you've made changes to your local `next` repository. In your app's root directory, run:

   ```sh
   pnpm install --force
   ```

### Troubleshooting

- If you see the below error while running `pnpm dev` with next:

```
Failed to load SWC binary, see more info here: https://nextjs.org/docs/messages/failed-loading-swc
```

Try to add the below section to your `package.json`, then run again

```json
"optionalDependencies": {
  "@next/swc-linux-x64-gnu": "canary",
  "@next/swc-win32-x64-msvc": "canary",
  "@next/swc-darwin-x64": "canary",
  "@next/swc-darwin-arm64": "canary"
},
```
