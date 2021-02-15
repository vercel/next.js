import { createFragmentContainer, graphql } from 'react-relay'
import BlogPostPreview from './BlogPostPreview'

const BlogPosts = ({ viewer }) => (
  <div>
    <h1>Blog posts</h1>
    {viewer.allBlogPosts?.edges.map(({ node }) => (
      <BlogPostPreview key={node.id} post={node} />
    ))}
  </div>
)

export default createFragmentContainer(BlogPosts, {
  viewer: graphql`
    fragment BlogPosts_viewer on Viewer {
      allBlogPosts(first: 10, orderBy: { createdAt: desc }) {
        edges {
          node {
            ...BlogPostPreview_post
            id
          }
        }
      }
    }
  `,
})
