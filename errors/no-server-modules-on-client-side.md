# Do Not Use Node.js Built in Modules in Client Side Code.

### Why This Error Occurred

The Node.js built-in module was used inside the React Component, that might lead to unexpected errors on client side.

### Possible Ways to Fix It

Move your logic to the one of page data fetching functions: `getStaticProps, getStaticPaths, getServerSideProps` and provide the data to the component through the props. We advise you to read [the documentation](https://nextjs.org/docs/basic-features/data-fetching).

```jsx
import { promises as fs } from 'fs'
import path from 'path'

// posts will be populated at build time by getStaticProps()
function Blog({ posts }) {
  return (
    <ul>
      {posts.map((post) => (
        <li>
          <h3>{post.filename}</h3>
          <p>{post.content}</p>
        </li>
      ))}
    </ul>
  )
}

export async function getStaticProps() {
  const postsDirectory = path.join(process.cwd(), 'posts')
  const filenames = await fs.readdir(postsDirectory)

  const posts = filenames.map(async (filename) => {
    const filePath = path.join(postsDirectory, filename)
    const fileContents = await fs.readFile(filePath, 'utf8')

    return {
      filename,
      content: fileContents,
    }
  })
  // By returning { props: { posts } }, the Blog component
  // will receive `posts` as a prop at build time
  return {
    props: {
      posts: await Promise.all(posts),
    },
  }
}
```

### Useful links

- [Data Fetching](https://nextjs.org/docs/basic-features/data-fetching)
- [API Routes](https://nextjs.org/docs/api-routes/introduction)
