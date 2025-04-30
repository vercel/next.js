# Next.js 410 Gone Status Example

This example demonstrates how to use the 410 Gone status in Next.js for content that has been permanently removed. This is useful for SEO and user experience when dealing with deliberately removed content.

## Features

- App Router implementation using `gone()` function
- Pages Router implementation using `{ gone: true }`
- Custom 410 Gone error pages
- API Routes returning 410 Gone status

## How It Works

### App Router

In the App Router, you can use the `gone()` function to send a 410 Gone response:

```jsx
import { gone } from "next/navigation";

export default function PostPage({ params }) {
  // Check if the post has been deleted
  if (isPostDeleted(params.slug)) {
    // Return a 410 Gone status
    gone();
  }

  // Render the post if it exists
  // ...
}
```

You can also create custom 410 pages with the `gone.js` file convention.

### Pages Router

In the Pages Router, you can return `{ gone: true }` from `getServerSideProps` or `getStaticProps`:

```jsx
export async function getServerSideProps({ params }) {
  // Check if the content has been deleted
  if (isContentDeleted(params.id)) {
    return {
      gone: true,
    };
  }

  // Return regular props otherwise
  return {
    props: {
      // ...
    },
  };
}
```

## Deployment

You can deploy this example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/gone-status&project-name=gone-status&repository-name=gone-status)
