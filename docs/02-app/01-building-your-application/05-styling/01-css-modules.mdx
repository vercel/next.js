---
title: CSS Modules
description: Style your Next.js Application with CSS Modules.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

<PagesOnly>

<details open>
  <summary>Examples</summary>

- [Basic CSS Example](https://github.com/vercel/next.js/tree/canary/examples/basic-css)

</details>

</PagesOnly>

Next.js has built-in support for CSS Modules using the `.module.css` extension.

CSS Modules locally scope CSS by automatically creating a unique class name. This allows you to use the same class name in different files without worrying about collisions. This behavior makes CSS Modules the ideal way to include component-level CSS.

## Example

<AppOnly>
CSS Modules can be imported into any file inside the `app` directory:

```tsx filename="app/dashboard/layout.tsx" switcher
import styles from './styles.module.css'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <section className={styles.dashboard}>{children}</section>
}
```

```jsx filename="app/dashboard/layout.js" switcher
import styles from './styles.module.css'

export default function DashboardLayout({ children }) {
  return <section className={styles.dashboard}>{children}</section>
}
```

```css filename="app/dashboard/styles.module.css"
.dashboard {
  padding: 24px;
}
```

</AppOnly>

<PagesOnly>

For example, consider a reusable `Button` component in the `components/` folder:

First, create `components/Button.module.css` with the following content:

```css filename="Button.module.css"
/*
You do not need to worry about .error {} colliding with any other `.css` or
`.module.css` files!
*/
.error {
  color: white;
  background-color: red;
}
```

Then, create `components/Button.js`, importing and using the above CSS file:

```jsx filename="components/Button.js"
import styles from './Button.module.css'

export function Button() {
  return (
    <button
      type="button"
      // Note how the "error" class is accessed as a property on the imported
      // `styles` object.
      className={styles.error}
    >
      Destroy
    </button>
  )
}
```

</PagesOnly>

CSS Modules are an _optional feature_ and are **only enabled for files with the `.module.css` extension**.
Regular `<link>` stylesheets and global CSS files are still supported.

In production, all CSS Module files will be automatically concatenated into **many minified and code-split** `.css` files.
These `.css` files represent hot execution paths in your application, ensuring the minimal amount of CSS is loaded for your application to paint.

## Global Styles

<AppOnly>
Global styles can be imported into any layout, page, or component inside the `app` directory.

> **Good to know**: This is different from the `pages` directory, where you can only import global styles inside the `_app.js` file.

For example, consider a stylesheet named `app/global.css`:

```css
body {
  padding: 20px 20px 60px;
  max-width: 680px;
  margin: 0 auto;
}
```

Inside the root layout (`app/layout.js`), import the `global.css` stylesheet to apply the styles to every route in your application:

```tsx filename="app/layout.tsx" switcher
// These styles apply to every route in the application
import './global.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

```jsx filename="app/layout.js" switcher
// These styles apply to every route in the application
import './global.css'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

</AppOnly>

<PagesOnly>

To add a stylesheet to your application, import the CSS file within `pages/_app.js`.

For example, consider the following stylesheet named `styles.css`:

```css filename="styles.css"
body {
  font-family: 'SF Pro Text', 'SF Pro Icons', 'Helvetica Neue', 'Helvetica',
    'Arial', sans-serif;
  padding: 20px 20px 60px;
  max-width: 680px;
  margin: 0 auto;
}
```

Create a [`pages/_app.js` file](/docs/pages/building-your-application/routing/custom-app) if not already present.
Then, [`import`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/import) the `styles.css` file.

```jsx filename="pages/_app.js"
import '../styles.css'

// This default export is required in a new `pages/_app.js` file.
export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}
```

These styles (`styles.css`) will apply to all pages and components in your application.
Due to the global nature of stylesheets, and to avoid conflicts, you may **only import them inside [`pages/_app.js`](/docs/pages/building-your-application/routing/custom-app)**.

In development, expressing stylesheets this way allows your styles to be hot reloaded as you edit them—meaning you can keep application state.

In production, all CSS files will be automatically concatenated into a single minified `.css` file. The order that the CSS is concatenated will match the order the CSS is imported into the `_app.js` file. Pay special attention to imported JS modules that include their own CSS; the JS module's CSS will be concatenated following the same ordering rules as imported CSS files. For example:

```jsx
import '../styles.css'
// The CSS in ErrorBoundary depends on the global CSS in styles.css,
// so we import it after styles.css.
import ErrorBoundary from '../components/ErrorBoundary'

export default function MyApp({ Component, pageProps }) {
  return (
    <ErrorBoundary>
      <Component {...pageProps} />
    </ErrorBoundary>
  )
}
```

</PagesOnly>

## External Stylesheets

<AppOnly>

Stylesheets published by external packages can be imported anywhere in the `app` directory, including colocated components:

```tsx filename="app/layout.tsx" switcher
import 'bootstrap/dist/css/bootstrap.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="container">{children}</body>
    </html>
  )
}
```

```jsx filename="app/layout.js" switcher
import 'bootstrap/dist/css/bootstrap.css'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="container">{children}</body>
    </html>
  )
}
```

> **Good to know**: External stylesheets must be directly imported from an npm package or downloaded and colocated with your codebase. You cannot use `<link rel="stylesheet" />`.

</AppOnly>

<PagesOnly>

Next.js allows you to import CSS files from a JavaScript file.
This is possible because Next.js extends the concept of [`import`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/import) beyond JavaScript.

### Import styles from `node_modules`

Since Next.js **9.5.4**, importing a CSS file from `node_modules` is permitted anywhere in your application.

For global stylesheets, like `bootstrap` or `nprogress`, you should import the file inside `pages/_app.js`.
For example:

```jsx filename="pages/_app.js"
import 'bootstrap/dist/css/bootstrap.css'

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}
```

For importing CSS required by a third-party component, you can do so in your component. For example:

```jsx filename="components/example-dialog.js"
import { useState } from 'react'
import { Dialog } from '@reach/dialog'
import VisuallyHidden from '@reach/visually-hidden'
import '@reach/dialog/styles.css'

function ExampleDialog(props) {
  const [showDialog, setShowDialog] = useState(false)
  const open = () => setShowDialog(true)
  const close = () => setShowDialog(false)

  return (
    <div>
      <button onClick={open}>Open Dialog</button>
      <Dialog isOpen={showDialog} onDismiss={close}>
        <button className="close-button" onClick={close}>
          <VisuallyHidden>Close</VisuallyHidden>
          <span aria-hidden>×</span>
        </button>
        <p>Hello there. I am a dialog</p>
      </Dialog>
    </div>
  )
}
```

</PagesOnly>

## Additional Features

Next.js includes additional features to improve the authoring experience of adding styles:

- When running locally with `next dev`, local stylesheets (either global or CSS modules) will take advantage of [Fast Refresh](/docs/architecture/fast-refresh) to instantly reflect changes as edits are saved.
- When building for production with `next build`, CSS files will be bundled into fewer minified `.css` files to reduce the number of network requests needed to retrieve styles.
- If you disable JavaScript, styles will still be loaded in the production build (`next start`). However, JavaScript is still required for `next dev` to enable [Fast Refresh](/docs/architecture/fast-refresh).
