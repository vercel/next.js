# Public directory imports are not supported

#### Why This Error Occurred

Next.js serves static files, like images, under a folder called `public` in the root directory. Files inside `public` can then be referenced by your code starting from the base URL (`/`).

The reason we don't support `public` directory imports is because the files within the directory should be considered external resources that are not directly required (imported) by one file, but instead required by all `pages` and `components`.

#### Possible Ways to Fix It

You should move any page-level/component-level assets from the `public` directory to the root directory (or any user-defined directory within the root directory) and then it can be imported.

**Before**

```sh
public/
  styles.css
pages/
  _app.js
```

```js
import '../public/styles.css'

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
```

**After**

```sh
pages/
  _app.js
styles.css
```

```js
import '../styles.css'

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
```

or

**After**

```sh
public/
  styles.css
pages/
  _app.js
```

```js
import Head from 'next/head'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <link rel="stylesheet" href="/example.css" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
```

### Useful Links

- [Static File Serving docs](https://nextjs.org/docs#static-file-serving-eg-images)
- [Adding a Global Stylesheet docs](https://nextjs.org/docs/basic-features/built-in-css-support#adding-a-global-stylesheet)
