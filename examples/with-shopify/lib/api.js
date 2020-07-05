import graphqlFetch from './graphql-fetch'

export async function getShopDataForHome() {
  const data = await graphqlFetch(`
    {
      shop {
        name
      }
      products(first: 10) {
        edges {
          node {
            id
            handle
            title
            images(first: 3) {
              edges {
                node {
                  altText
                  originalSrc
                }
              }
            }
            priceRange {
              maxVariantPrice {
                amount
                currencyCode
              }
              minVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  priceV2 {
                    amount
                    currencyCode
                  }
                  selectedOptions {
                    name
                    value
                  }
                  image {
                    altText
                    originalSrc
                    transformedSrc(maxHeight: 384, maxWidth: 384, crop: CENTER)
                  }
                }
              }
            }
          }
        }
      }
    }
  `)

  return data
}

export async function getAllProductsWithSlug() {
  const data = await graphqlFetch(`
    {
      products(first: 250) {
        edges {
          node {
            handle
          }
        }
      }
    }
  `)

  return data.products
}

export async function getProductAndMoreProducts(handle) {
  const data = await graphqlFetch(
    `
    query ProductAndMoreProducts($handle: String!) {
      shop {
        name
      }
      productByHandle(handle: $handle) {
        id
        handle
        title
        description
        images(first: 100) {
          edges {
            node {
              altText
              originalSrc
            }
          }
        }
        priceRange {
          maxVariantPrice {
            amount
            currencyCode
          }
          minVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 10) {
          edges {
            node {
              id
              title
              priceV2 {
                amount
                currencyCode
              }
              selectedOptions {
                name
                value
              }
              image {
                altText
                originalSrc
                transformedSrc(maxHeight: 512, maxWidth: 512, crop: CENTER)
              }
            }
          }
        }
      }
    }
  `,
    { variables: { handle } }
  )

  return {
    shop: data.shop,
    product: data.productByHandle,
  }
}
