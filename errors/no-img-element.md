# No Img Element

### Why This Error Occurred

An HTML `<img>` element was used to display an image. For better performance and automatic image optimization, use Next.js' built-in image component instead.

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

### Useful Links

- [Image Component and Image Optimization](https://nextjs.org/docs/basic-features/image-optimization)
