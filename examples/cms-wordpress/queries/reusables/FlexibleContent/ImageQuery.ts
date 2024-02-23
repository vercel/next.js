export const ImageQuery = `
  ... on FlexiblecontentFlexibleContentImageLayout {
    fieldGroupName
    image {
      node {
        altText
        mediaDetails {
          width
          height
        }
        sourceUrl
      }
    }
  }
`;
