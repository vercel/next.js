import gql from "graphql-tag";

export const ContentInfoQuery = gql`
  query ContentInfo($slug: ID!, $idType: ContentNodeIdTypeEnum!) {
    contentNode(id: $slug, idType: $idType) {
      contentTypeName
      databaseId
      status
      uri
    }
  }
`;
