export const PageQuery = `
query($id: ID!, $preview: Boolean = false) {
    page(id: $id, idType: DATABASE_ID, asPreview: $preview) {
        content
    }
  }`;
