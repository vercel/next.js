# No Img Element

> Prevent usage of `<img>` element to prevent layout shift and favor [optimized images](https://nextjs.org/docs/basic-features/image-optimization).

### Why This Error Occurred

An `<img>` element was used to display an image.

### Possible Ways to Fix It

Use [`next/image`](https://nextjs.org/docs/api-reference/next/image) to improve performance with automatic [Image Optimization](https://nextjs.org/docs/basic-features/image-optimization).

> Note: Remember to check the pricing of your [deployment provider](https://nextjs.org/docs/deployment) before enabling Image Optimization because billing for optimized images might be charged differently that the original images. When self-hosting, Image Optimization will use more disk space to cache optimized images.

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
