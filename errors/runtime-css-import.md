# Runtime CSS import

#### Why This Error Occurred

Runtime CSS imports are bad for perfomance because the browser can't know about the `@import` until the stylesheet is downloaded. This means the stylesheets can't be fetched in parallel.

#### Possible Ways to Fix It

Import the CSS file in a JavaScript module or use a relative `@import` in your CSS.

**Before**

```css
/* url() starts with `/`, will be interpreted as a URL */
@import url('/styles.css');
```

**After**

```jsx
// pages/_app.js
import './styles.css'
```

```css
/* Will be inlined at build time */
@import url('./styles.css');
```

If it's a remote stylesheet, use `<link>` instead of `@import`.

**Before**

```css
@import url('https://fonts.googleapis.com/css2?family=Inter&display=swap');
```

**After**

```jsx
// pages/_document.js
<Head>
  <link
    href="https://fonts.googleapis.com/css2?family=Inter&display=swap"
    rel="stylesheet"
  />
</Head>
```

#### Ignoring the error

If you are certain you want to use it, even though it's bad for performance, you can allow runtime CSS imports by adding a comment at the top of you CSS file.

```css
/* allow-dangerous-css-imports */
@import url('https://fonts.googleapis.com/css2?family=Inter&display=swap');
```

Or SCSS file

```scss
/*! allow-dangerous-css-imports */
@import url('https://fonts.googleapis.com/css2?family=Inter&display=swap');
```
