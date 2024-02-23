export const ContentInfoQuery = (type: "slug" | "id") => `
query($slug: ID!) {
    contentNode(id: $slug, idType: ${type == "id" ? "DATABASE_ID" : "URI"}) {
        contentTypeName
        databaseId
        status
        uri
    }
}`;
