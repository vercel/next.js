# Example app with Workbox

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-workbox with-workbox-app
# or
yarn create next-app --example with-workbox with-workbox-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-workbox
cd with-workbox
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## To remove Typescript

Delete the line: `"noEmit": true,` from tsconfig.json, then:

```
yarn tsc
yarn tsc -p ./utils/service-worker/tsconfig.json
```

Then delete all `.ts`, `.tsx` and `tsconfig.json` files
Remove `typescript` and `@types/*` from dependencies.

## Usage with [Static HTML Export](https://github.com/zeit/next.js/#static-html-export)

Install serve, workbox-cli

```
npm install serve workbox-cli
```

or

```
yarn add serve workbox-cli
```

Create file workbox-config.js

```js
module.exports = {
  globDirectory: 'out',
  globPatterns: ['**/*.html'],
  swSrc: 'public/sw.js',
  injectionPoint: 'self.__WB_INJECT_MANIFEST',
  swDest: 'out/sw.js',
}
```

Modify scripts in package.json:

```
"build": "next build && next export && workbox injectManifest workbox-config.js"
"start": "serve ./out"
```

In sw.ts modify `precacheAndRoute(self.__WB_MANIFEST);` to `precacheAndRoute(self.__WB_MANIFEST.concat(self.__WB_INJECT_MANIFEST));` (You will have to modify type definition).

## The idea behind the example

Implementation of https://redfin.engineering/how-to-fix-the-refresh-button-when-using-service-workers-a8e27af6df68

This example features:

- Service Worker with Typescript
- Service Worker Bundling (Provided by the workbox webpack plugin)
- Precaching of client side assets
- Communication to user that new update is available.
- Reload all existing tabs when Service Worker is updated to avoid state mismatch.
- Update service worker when user navigates (by clicking on link or some action)
- Update service worker when user refreshes the page
- How to use assetPrefix when assets are uploaded to CDN

Further Reading:

- https://redfin.engineering/how-to-fix-the-refresh-button-when-using-service-workers-a8e27af6df68
- next-offline: https://github.com/hanford/next-offline
- Udacity Course: https://classroom.udacity.com/courses/ud899
