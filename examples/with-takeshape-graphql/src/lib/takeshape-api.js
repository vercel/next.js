import fetch from 'node-fetch'

const ENDPOINT = `https://api.takeshape.io/project/${process.env.TAKESHAPE_PROJECT}/graphql`

/**
 * This method is only used by getStaticProps, client side code will never include this or
 * the API Key
 */
export async function graphqlFetch(params) {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TAKESHAPE_API_KEY}`,
      },
      body: JSON.stringify(params),
    })
    const json = await res.json()

    if (json.errors) throw json.errors
    return json.data
  } catch (error) {
    console.error(error)
    throw error
  }
}
