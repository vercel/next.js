# Install `sharp` to Use Built-In Image Optimization

#### Why This Error Occurred

Using Next.js' built-in [Image Optimization](https://nextjs.org/docs/basic-features/image-optimization) requires `sharp` as a dependency.

You are seeing this error because your OS was unable to install `sharp` properly, either using pre-build binaries or building from source.

#### Possible Ways to Fix It

Option 1: Use a different version of Node.js and try to install `sharp` again.

```bash
npm i sharp
# or
yarn add sharp
```

Option 2: Use a different OS.

For example, if you're using Windows, try Linux.

Option 3: Configure the [loader](https://nextjs.org/docs/basic-features/image-optimization#loader) in `next.config.js` to use a cloud provider, such as [imgix](https://imgix.com).

```js
module.exports = {
  images: {
    path: 'https://example.com/myaccount/',
    loader: 'imgix',
  },
}
```
