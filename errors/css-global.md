# Global CSS Must Be in Your Custom \<App\>

#### Why This Error Occurred

An attempt to import Global CSS from a file other than [`pages/_app.js`](https://nextjs.org/docs/advanced-features/custom-app) was made.

Global CSS cannot be used in files other than your [Custom `<App>`](https://nextjs.org/docs/advanced-features/custom-app) due to its side-effects and ordering problems.

#### Possible Ways to Fix It

Relocate all Global CSS imports to your [`pages/_app.js` file](https://nextjs.org/docs/advanced-features/custom-app).

Or consider using [CSS Modules](https://nextjs.org/blog/next-9-2#built-in-css-module-support-for-component-level-styles) instead.

#### Example

```jsx
// pages/_app.js
import '../styles.css'

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}
```
