import getDriver from "../../../util/neo4j";

const driver = getDriver();
const session = driver.session();

export default async function handler(req, res) {
  const { method } = req;

  switch (method) {
    case "GET":
      try {
        const moviesTxResultPromise = session.readTransaction(
          async (transaction) => {
            const cypher = `
              MATCH (movie:Movie)
              RETURN movie {.*,
                actors: [ (movie)<-[:ACTED_IN]-(actor) | actor.name ],
                directed: [ (movie)<-[:DIRECTED]-(director) | director.name ]
              } as movie
              ORDER BY movie.title ASC
            `;

            const moviesTxResponse = await transaction.run(cypher);
            const movies = moviesTxResponse.records.map((r) => r.get("movie"));
            return movies;
          },
        );
        const movies = await moviesTxResultPromise;
        res.status(200).json({ success: true, movies });
      } catch (error) {
        res.status(400).json({ success: false });
      }
      break;
    default:
      res.status(400).json({ success: false });
      break;
  }
}
