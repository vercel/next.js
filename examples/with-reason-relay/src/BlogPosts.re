module Fragment = [%relay.fragment {|
  fragment BlogPosts_fragment on Viewer {
    allBlogPosts(first: 10, orderBy: { createdAt: desc }) {
      edges {
        node {
          ...BlogPostPreview_fragment
          id
        }
      }
    }
  }
|}];

[@react.component]
let make = (~viewer) => {
  let fragment = Fragment.use(viewer); 
  <div>
    <h1>{React.string("Blog posts")}</h1>
    <ul>
      {switch (fragment.allBlogPosts.edges) {
        | Some(posts) => {
            Belt.Array.map(posts, post => {
              switch (post) {
              | None => React.null
              | Some(p) => 
                <BlogPostPreview key={p.node.id} post={p.node.getFragmentRefs()} />
              }
            })->React.array
          }
        | None => <li>{React.string("No posts found")}</li>
      }}
    </ul>
  </div>
  };

