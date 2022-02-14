# Google Font Display

> Enforce font-display behavior with Google Fonts.

### Why This Error Occurred

For a Google Font, the font-display descriptor was either missing or set to `auto`, `block`, or `fallback`, which are not recommended.

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

If you want to specifically display a font using a `auto, `block`, or `fallback` strategy, then you can disable this rule.

### Useful Links

- [Controlling Font Performance with font-display](https://developers.google.com/web/updates/2016/02/font-display)
- [Font-display: a small explainer on web fonts and performance](https://font-display.glitch.me/)
