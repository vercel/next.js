# Image Domain

### Why This Error Occurred

To enable Image Optimization for any image hosted on an external website using the `<Image />` component, its domain needs to be specified in `next.config.js`.

### Possible Ways to Fix It

#### Specify Domain

If you are displaying an external image and want to use Next.js' built-in Image Optimization, include the domain of the image in `next.config.js`:

```jsx
module.exports = {
  images: {
    domains: ['example.com'],
  },
}
```

This allows you to to use any absolute URL from the same domain for the image source:

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

#### Custom Loader

If you are using a separate cloud provider to optimize images, configure your loader by specifying it along with a path prefix in `next.config.js`:

```js
module.exports = {
  images: {
    loader: 'imgix',
    path: 'https://example.com/',
  },
}
```

Or by using the `loader` prop if your specific cloud provider is not supported:

```jsx
import { Image } from 'next/image'

const myLoader = ({ src, width, quality }) => {
  return `https://example.com/${src}?w=${width}&q=${quality || 75}`
}

function Home() {
  return (
    <>
      <Image
        loader={myLoader}
        src="/landscape.png"
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

- [Configuration - Image Component and Image Optimization](https://nextjs.org/docs/basic-features/image-optimization#configuration)
- [loader - next/image](https://nextjs.org/docs/api-reference/next/image#loader)
