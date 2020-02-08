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

This folder is also useful for `robots.txt`, Google Site Verification, and any other static files (including `.html`)!

> **Note**: Don't name the `public` directory anything else. The name cannot be changed and is the only directory used to serve static assets.

> **Note**: Be sure to not have a static file with the same name as a file in the `pages/` directory, as this will result in an error.
>
> Read more: <http://err.sh/next.js/conflicting-public-file-page>
