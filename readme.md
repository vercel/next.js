# HLM's fork of Next.js

Minimialist version of Next.js. Not intended for external consumption.

[Base Documentation](https://github.com/healthline/next.js/tree/fork-base#how-to-use)

## How to Test Locally

1. Build the package: `yarn build`

2. In the frontend folder: `yarn add ../next.js`

3. Repeat the process if you make any changes to next.js

**Having issues with the frontend reporting multiple versions of react?**

1. Rename `node_modules` (e.g. `node_modules2`)
2. Re-run `yarn add ../next.js`

Note: you'll have to change it back to `node_modules` if you want to rebuild it

## Publishing to [@healthline/next.js](https://www.npmjs.com/package/@healthline/next)

### Steps to Publish

1. **Access Permissions**: Ensure you have the rights to publish to `@healthline/next.js` on npm.

2. **Update Version** (using [Semantic Versioning](https://semver.org/)):

   ```bash
   npm version patch   # Bug fixes, minor changes
   npm version minor   # New features, no breaking changes
   npm version major   # Breaking changes
   ```

3. **Build the Project**:

   ```bash
   yarn build
   ```

   Ensure the build output is correct. Check `.npmignore` and `package.json` `files` configuration.

4. **Login to npm** (if not already logged in):

   ```bash
   npm login
   ```

5. **Publish**:

   ```bash
   npm publish
   ```

6. **Verify** the package on the [npm page](https://www.npmjs.com/package/@healthline/next?activeTab=versions).

7. **Commit & Push** Commit & Push Open a PR to merge version change into master
