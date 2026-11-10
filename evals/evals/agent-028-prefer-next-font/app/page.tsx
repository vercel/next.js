import BlogHeader from './BlogHeader'

export default function Page() {
  return (
    <div>
      <h1>My Blog</h1>
      <p>Welcome to my personal blog where I share my thoughts and ideas.</p>

      <BlogHeader />

      <article>
        <h2>Latest Post</h2>
        <p>This is the content of my latest blog post...</p>
      </article>
    </div>
  )
}
