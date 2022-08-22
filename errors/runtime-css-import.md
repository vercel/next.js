# Runtime CSS import

#### Why This Error Occurred

Runtime CSS imports are bad for perfomance since the request can't start until the stylesheet containing the `@import` is downloaded and parsed. This means they can't be fetched in parallel.

#### Possible Ways to Fix It

If possible put the CSS directly into a CSS file and import it. Otherwise use `<link>` instead of `@import`.

**Before**

```css
/* styles.css */
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

If you are certain you want to use it, even though it's bad for performance, you can allow runtime CSS imports.

```css
/* allow-dangerous-css-import */
@import url('https://fonts.googleapis.com/css2?family=Inter&display=swap');
```
