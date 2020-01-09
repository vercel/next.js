---
description: Next.js allows you to serve static files, like images, in the public directory. You can learn how it works here.
---

# Static File Serving

Next.js can serve static files, like images, under a folder called `public` in the root directory. Files inside `public` can then be referenced by your code starting from the base URL (`/`).

For example, if you add an image to `public/my-image.png`, the following code will access the image:

```jsx
function MyImage() {
  return <img src="/my-image.png" alt="my image" />
}

export default MyImage
```

> Don't name the `public` directory anything else. The name can't be changed and is the only directory that **Next.js** uses to serve static assets.

> If you ever add a static asset that conflicts with the name of a page in the `pages` directory, the public file will be ignored in favor of the file in `pages`.
