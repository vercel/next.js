import { Customer, Product, Search } from 'commerce-sdk'

export default async function getProducts(searchQuery) {
  const clientConfig = {
    headers: {
      authorization: ``,
    },
    parameters: {
      clientId: process.env.SFDC_CLIENT_ID,
      secret: process.env.SFDC_SECRET,
      organizationId: process.env.SFDC_ORGANIZATIONID,
      shortCode: process.env.SFDC_SHORTCODE,
      siteId: process.env.SFDC_SITEID,
    },
  }

  const credentials = `${clientConfig.parameters.clientId}:${clientConfig.parameters.secret}`
  const base64data = Buffer.from(credentials).toString('base64')
  const headers = { Authorization: `Basic ${base64data}` }
  const client = new Customer.ShopperLogin(clientConfig)

  const shopperToken = await client.getAccessToken({
    headers,
    body: {
      grant_type: 'client_credentials',
    },
  })

  const configWithAuth = {
    ...clientConfig,
    headers: { authorization: `Bearer ${shopperToken.access_token}` },
  }

  const searchClient = new Search.ShopperSearch(configWithAuth)
  const searchResults = await searchClient.productSearch({
    parameters: { q: searchQuery },
  })

  const results = []

  const productsClient = new Product.ShopperProducts(configWithAuth)
  await Promise.all(
    searchResults.hits.map(async (product) => {
      const productResults = await productsClient.getProduct({
        parameters: {
          organizationId: clientConfig.parameters.organizationId,
          siteId: clientConfig.parameters.siteId,
          id: product.productId,
        },
      })

      results.push(productResults)
    })
  )

  return results
}
