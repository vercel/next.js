# beforeInteractive Script component outside \_document.js

#### Why This Error Occurred

You can't use the `next/script` component with the `beforeInteractive` strategy outside the `_document.js` page. That's because `beforeInteractive` strategy only works inside **\_document.js** and is designed to load scripts that are needed by the entire site (i.e. the script will load when any page in the application has been loaded server-side).

#### Possible Ways to Fix It

If you want a global script, move the script inside `_document.js` page.

```jsx
// In _document.js

export default class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
          <Script
            src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js"
            strategy="beforeInteractive"
          ></Script>
        </body>
      </Html>
    )
  }
}
```

- [next-script](https://nextjs.org/docs/basic-features/script#usage)
