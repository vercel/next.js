# Install `sharp` to Use Built-In Image Optimization

#### Why This Error Occurred

Using Next.js' built-in Image Optimization requires that you install `sharp`.

Since `sharp` is optional, it may have been skipped if you installed `next` with the [`--no-optional`](https://docs.npmjs.com/cli/install) flag or it may have been skipped if your platform does not support `sharp`.

#### Possible Ways to Fix It

Option 1: Install the `sharp` package in your project.

```bash
npm i sharp
# or
yarn add sharp
```

Option 2: Configure an external loader in `next.config.js` such as [imgix](https://imgix.com).

```js
module.exports = {
  images: {
    path: 'https://example.com/myaccount/',
    loader: 'imgix',
  },
}
```
