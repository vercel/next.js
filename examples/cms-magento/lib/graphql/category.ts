import gql from 'graphql-tag'

export const CATEGORY_LIST_QUERY = gql`
  query categoryList($eq: String!) {
    categoryList(filters: { url_key: { eq: $eq } }) {
      products(currentPage: 1) {
        items {
          id
          name
          sku
          stock_status
          image {
            url
          }
          price_range {
            maximum_price {
              final_price {
                value
              }
            }
          }
        }
      }
    }
  }
`
