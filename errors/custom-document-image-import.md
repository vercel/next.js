# Images cannot be imported into your custom document.

#### Why This Error Occurred

An attempt to import an image file into [`pages/_document.js`](https://nextjs.org/docs/advanced-features/custom-document) was made.

Custom documents aren't compiled for the browser and images statically imported like this will not be displayed.

#### Possible Ways to Fix It

If your image needs to be displayed on every page you can relocate it to your [`pages/_app.js`](https://nextjs.org/docs/advanced-features/custom-app) file.

#### Example

```jsx
//pages/_app.js
import yourImage from 'path/to/your/image'
import Image from 'next/image'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Image src={yourImage} alt="your_image_description" />
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
```

If your application is not using image imports with `next/image`, you can disable the built-in loader with the following next.config.js:

```js
module.exports = {
  images: {
    disableStaticImages: true,
  },
}
```

### Useful Links

- [Custom `Document`](https://nextjs.org/docs/advanced-features/custom-document)
- [Custom `App`](https://nextjs.org/docs/advanced-features/custom-app)
- [Static File Serving](https://nextjs.org/docs/basic-features/static-file-serving)
- [Disable Static Image Imports](https://nextjs.org/docs/api-reference/next/image#disable-static-imports)
