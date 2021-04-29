# No StaticImage for External Image

### Why This Error Occurred

The `<StaticImage />` component was used for an external image and should only be used for images stored locally on disk.

### Possible Ways to Fix It

#### Image

If you are displaying an external image that is not stored locally on disk, import and use the `<Image />` component instead:

```jsx
import { Image } from 'next/image'

function Home() {
  return (
    <>
      <Image
        src="https://example.com/landscape.png"
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
