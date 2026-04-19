import gql from "graphql-tag";

export const SeoQuery = gql`
  query SeoQuery(
    $slug: ID!
    $idType: ContentNodeIdTypeEnum
    $preview: Boolean = false
  ) {
    contentNode(id: $slug, idType: $idType, asPreview: $preview) {
      seo {
        canonical
        cornerstone
        focuskw
        metaDesc
        metaKeywords
        metaRobotsNofollow
        metaRobotsNoindex
        opengraphAuthor
        opengraphDescription
        opengraphModifiedTime
        opengraphPublishedTime
        opengraphPublisher
        opengraphSiteName
        opengraphTitle
        opengraphType
        opengraphUrl
        readingTime
        title
        twitterDescription
        twitterTitle
        opengraphImage {
          altText
          mediaDetails {
            height
            width
          }
          sourceUrl
        }
        twitterImage {
          altText
          mediaDetails {
            width
            height
          }
          sourceUrl
        }
      }
    }
  }
`;
