# No Img Element

### Why This Error Occurred

An HTML `<img>` element was used to display an image. For better performance and automatic image optimization, use one of Next.js' built-in image components instead.

### Possible Ways to Fix It

#### Image

If you are displaying an external image that is not stored locally on disk, import and use the `<Image />` component:

```jsx
import { Image } from 'next/image'

function Home() {
  return (
    <>
      <Image
        src="https://picsum.photos/200"
        alt="Landscape picture"
        width={500}
        height={500}
      />
    </>
  )
}

export default Home
```

#### StaticImage

If you are displaying a local (on disk) image, import and use the `<StaticImage />` component:

```jsx
import { StaticImage } from 'next/image'

function Home() {
  return (
    <>
      <StaticImage src="/goat.png" alt="Mountain goat" />
    </>
  )
}

export default Home
```

### Useful Links

- [Image Component and Image Optimization](https://nextjs.org/docs/basic-features/image-optimization)
