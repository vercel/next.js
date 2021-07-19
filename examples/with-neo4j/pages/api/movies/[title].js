import getDriver from '../../../util/neo4j'

const driver = getDriver()
const session = driver.session()

export default async function handler(req, res) {
  const {
    query: { title },
    method,
  } = req
  const movieTitle = decodeURIComponent(title)

  switch (method) {
    case 'GET':
      try {
        const movieTxResultPromise = session.readTransaction(
          async (transaction) => {
            const cypher = `
              MATCH (movie:Movie {title: $movieTitle})
              RETURN movie {.*,
                actors: [ (actor)-[:ACTED_IN]->(movie) | actor.name ],
                directed: [ (director)-[:DIRECTED]->(movie) | director.name ]
              } as movie
            `

            const movieTxResponse = await transaction.run(cypher, {
              movieTitle,
            })
            const [movie] = movieTxResponse.records.map((r) => r.get('movie'))
            return movie
          }
        )
        const movie = await movieTxResultPromise
        res.status(200).json({ success: true, movie })
      } catch (error) {
        res.status(400).json({ success: false })
      }
      break
    default:
      res.status(400).json({ success: false })
      break
  }
}
