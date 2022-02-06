---
description: 'Learn how to create or update static pages at runtime with Incremental Static Regeneration.'
---

# Incremental Static Regeneration

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://nextjs.org/commerce">Next.js Commerce</a></li>
    <li><a href="https://reactions-demo.vercel.app/">GitHub Reactions Demo</a></li>
    <li><a href="https://static-tweet.vercel.app/">Static Tweet Demo</a></li>
  </ul>
</details>

<details>
  <summary><b>Version History</b></summary>

| Version  | Changes          |
| -------- | ---------------- |
| `v9.5.0` | Base Path added. |

</details>

Next.js allows you to create or update static pages _after_ you’ve built your site. Incremental Static Regeneration (ISR) enables you to use static-generation on a per-page basis, **without needing to rebuild the entire site**. With ISR, you can retain the benefits of static while scaling to millions of pages.

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

// This function gets called at build time on server-side.
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

// This function gets called at build time on server-side.
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
