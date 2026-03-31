import { createFragmentContainer, graphql } from "react-relay";

const BlogPostPreview = ({ post }) => <li>{post.title}</li>;

export default createFragmentContainer(BlogPostPreview, {
  post: graphql`
    fragment BlogPostPreview_post on BlogPost {
      id
      title
    }
  `,
});
