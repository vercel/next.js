# Google Font Display

### Why This Error Occurred

For a Google Font, the `display` descriptor was either not assigned or set to `auto`, `fallback`, or `block`.

### Possible Ways to Fix It

For most cases, the best font display strategy for custom fonts is `optional`.

```jsx
import Head from 'next/head'

export default function IndexPage() {
  return (
    <div>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Krona+One&display=optional"
          rel="stylesheet"
        />
      </Head>
    </div>
  )
}
```

Specifying `display=optional` minimizes the risk of invisible text or layout shift. If swapping to the custom font after it has loaded is important to you, then use `display=swap` instead.

### When Not To Use It

If you want to specifically display a font using a `block` or `fallback` strategy, then you can disable this rule.

### Useful Links

- [Google Fonts API Docs](https://developers.google.com/fonts/docs/css2#use_font-display)
- [CSS `font-display` property](https://www.w3.org/TR/css-fonts-4/#font-display-desc)
