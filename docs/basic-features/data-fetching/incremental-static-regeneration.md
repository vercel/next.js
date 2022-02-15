---
description: 'Learn how to create or update static pages at runtime with Incremental Static Regeneration.'
---

# Incremental Static Regeneration

Next.js allows you to create or update static pages _after_ you’ve built your site. Incremental Static Regeneration (ISR) enables you to use static-generation on a per-page basis, **without needing to rebuild the entire site**. With ISR, you can retain the benefits of static while scaling to millions of pages.

## When should I use ISR?

Incremental Static Regeneration works well for e-commerce, marketing pages, blog posts, ad-backed media, and more.

Consider an e-commerce store with 100,000 products. At a realistic 50ms to statically generate each product page, the build would take almost 2 hours without ISR. With ISR, we can choose from:

- **Faster Builds** → Generate the most popular 1,000 products at build-time. Requests made to other products will be a cache miss and statically generate on-demand: 1-minute builds.
- **Higher Cache Hit Rate** → Generate 10,000 products at build-time, ensuring more products are cached ahead of a user's request: 8-minute builds.

The big advantage of ISR is having the flexibility to choose which pages are generated at build or on-demand. Choose from faster builds or more cached pages.

## Using ISR to fetch data from a blog

To use ISR add the `revalidate` prop to `getStaticProps`:

```jsx
function Blog({ posts }) {
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}

// This function gets called at build time on the server-side.
// It may be called again, on a serverless function, if
// revalidation is enabled and a new request comes in
export async function getStaticProps() {
  const res = await fetch('https://.../posts')
  const posts = await res.json()

  return {
    props: {
      posts,
    },
    // Next.js will attempt to re-generate the page:
    // - When a request comes in
    // - At most once every 10 seconds
    revalidate: 10, // In seconds
  }
}

// This function gets called at build time on the server-side.
// It may be called again, on a serverless function, if
// the path has not been generated.
export async function getStaticPaths() {
  const res = await fetch('https://.../posts')
  const posts = await res.json()

  // Get the paths we want to pre-render based on posts
  const paths = posts.map((post) => ({
    params: { id: post.id },
  }))

  // We'll pre-render only these paths at build time.
  // { fallback: blocking } will server-render pages
  // on-demand if the path doesn't exist.
  return { paths, fallback: 'blocking' }
}

export default Blog
```

When a request is made to a page that was pre-rendered at build time, it will initially show the cached page.

- Any requests to the page after the initial request and before 10 seconds are also cached and instantaneous.
- After the 10-second window, the next request will still show the cached (stale) page
- Next.js triggers a regeneration of the page in the background.
- Once the page has been successfully generated, Next.js will invalidate the cache and show the updated page. If the background regeneration fails, the old page would still be unaltered.

When a request is made to a path that hasn’t been generated, Next.js will server-render the page on the first request. Future requests will serve the static file from the cache.

[Incremental Static Regeneration](https://vercel.com/docs/concepts/next.js/incremental-static-regeneration) covers how to persist the cache globally and handle rollbacks.

## Examples

- [**E-commerce Demo**](https://nextjs.org/commerce) – Next.js Commerce is an all-in-one starter kit for high-performance e-commerce sites.
- [**GitHub Reactions Demo**](https://reactions-demo.vercel.app/) – React to the original GitHub issue and watch ISR update the statically generated landing page.
- [Static Tweets Demo](https://static-tweet.vercel.app/) – This project deploys in 30 seconds, but can statically generate 500M tweets on-demand using ISR.

<details>
  <summary><b>Version History</b></summary>

| Version  | Changes          |
| -------- | ---------------- |
| `v9.5.0` | Base Path added. |

</details>
