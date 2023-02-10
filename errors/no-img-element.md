# No img element

> Prevent usage of `<img>` element to prevent layout shift and favor [optimized images](https://nextjs.org/docs/basic-features/image-optimization).

### Why This Error Occurred

An `<img>` element was used to display an image.

### Possible Ways to Fix It

Use [`next/image`](https://nextjs.org/docs/api-reference/next/image) to improve performance with automatic [Image Optimization](https://nextjs.org/docs/basic-features/image-optimization).

> Note: If deploying to a [managed hosting provider](https://nextjs.org/docs/deployment), remember to check pricing since optimized images might be charged differently than the original images. If self-hosting, remember to install [`sharp`](https://www.npmjs.com/package/sharp) and check if your server has enough storage to cache the optimized images.

```jsx
import Image from 'next/image'

function Home() {
  return (
    <Image
      src="https://example.com/hero.jpg"
      alt="Landscape picture"
      width={800}
      height={500}
    />
  )
}

export default Home
```

If you would like to use `next/image` features such as blur-up placeholders but disable Image Optimization, you can do so using [unoptimized](https://nextjs.org/docs/api-reference/next/image#unoptimized).

<br />

Or, use a `<picture>` element with the nested `<img>` element:

```jsx
function Home() {
  return (
    <picture>
      <source srcSet="https://example.com/hero.avif" type="image/avif" />
      <source srcSet="https://example.com/hero.webp" type="image/webp" />
      <img
        src="https://example.com/hero.jpg"
        alt="Landscape picture"
        width={800}
        height={500}
      />
    </picture>
  )
}
```

### Useful Links

- [Image Component and Image Optimization](https://nextjs.org/docs/basic-features/image-optimization)
- [next/image API Reference](https://nextjs.org/docs/api-reference/next/image)
- [Largest Contentful Paint (LCP)](https://nextjs.org/learn/seo/web-performance/lcp)
