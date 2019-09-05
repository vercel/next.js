# Static directory is deprecated

#### Why This Error Occurred

In versions prior to 9.0.6 the `static` directory was used to serve static assets in a Next.js application. This has been deprecated in favor of a `public` directory.

The reason we want to support a `public` directory instead is to not require the `/static` prefix for assets anymore and there is no reason to maintain both paths.

#### Possible Ways to Fix It

Rename your `static` directory to public and update any URLs pointing to these files to not have the `/static` prefix

**Before**
```sh
static/
  my-image.jpg
pages/
  index.js
components/
  my-image.js
```

```jsx
export default function MyImage() {
  return <img src='/static/my-image.jpg' />
}
```

**After**
```sh
public/
  my-image.jpg
pages/
  index.js
components/
  my-image.js
```

```jsx
export default function MyImage() {
  return <img src='/my-image.jpg' />
}
```

### Useful Links

- [Static file serving docs](https://nextjs.org/docs#static-file-serving-eg-images)
