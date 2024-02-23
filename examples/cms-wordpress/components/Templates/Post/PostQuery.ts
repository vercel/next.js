export const PostQuery = `
query($id: ID!, $preview: Boolean = false) {
    post(id: $id, idType: DATABASE_ID, asPreview: $preview) {
      content
      date
      title
      author {
        node {
          name
        }
      }
    }
  }`;
