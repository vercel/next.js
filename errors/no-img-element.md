# No Img Element

> Prevent usage of `<img>` element to prevent layout shift.

### Why This Error Occurred

An `<img>` element was used to display an image. Use either `<picture>` in conjunction with `<img>` element, or use `next/image` that has better performance and automatic Image Optimization over `<img>`.

### Possible Ways to Fix It

Import and use the `<Image />` component:

```jsx
import Image from 'next/image'

function Home() {
  return (
    <>
      <Image
        src="https://example.com/test"
        alt="Landscape picture"
        width={500}
        height={500}
      />
    </>
  )
}

export default Home
```

<br />

Use `<picture>` in conjunction with `<img>` element:

```jsx
function Home() {
  return (
    <>
      <picture>
        <source srcSet="https://example.com/test" type="image/webp" />
        <img src="https://example.com/test" alt="Landscape picture" />
      </picture>
    </>
  )
}
```

### Useful Links

- [Image Component and Image Optimization](https://nextjs.org/docs/basic-features/image-optimization)
