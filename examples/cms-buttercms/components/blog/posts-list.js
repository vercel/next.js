import PostsPreview from "./post-preview";

export default function PostsList({ posts }) {
  return (
    <div className="col-12 col-lg-8 blog-roll-cards">
      <div className="row">
        {posts.map((post) => (
          <PostsPreview
            key={post.slug}
            title={post.title}
            coverImage={post.featuredImage}
            date={post.published}
            author={post.author}
            slug={post.slug}
            excerpt={post.summary}
            coverImageAlt={post.featuredImageAlt}
            tags={post.tags}
          />
        ))}
        {!posts.length && <div>No blog posts found.</div>}
      </div>
    </div>
  );
}
