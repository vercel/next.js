export const SeoQuery = (type: "slug" | "id") => `
  query ($slug: ID!, $preview: Boolean = false) {
    contentNode(id: $slug, idType: ${
      type == "id" ? "DATABASE_ID" : "URI"
    }, asPreview: $preview) {
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
