import getDriver from "../../../util/neo4j";

const driver = getDriver();
const session = driver.session();

export default async function handler(req, res) {
  const {
    query: { name },
    method,
  } = req;
  const actorName = decodeURIComponent(name);

  switch (method) {
    case "GET":
      try {
        const actorTxResultPromise = session.readTransaction(
          async (transaction) => {
            const cypher = `
              MATCH (actor:Person {name: $actorName})
              RETURN actor {.*,
                movies: [ (actor)-[:ACTED_IN]->(m) | m.title ]
              } as actor
            `;

            const actorTxResponse = await transaction.run(cypher, {
              actorName,
            });
            const [actor] = actorTxResponse.records.map((r) => r.get("actor"));
            return actor;
          },
        );
        const actor = await actorTxResultPromise;
        res.status(200).json({ success: true, actor });
      } catch (error) {
        res.status(400).json({ success: false });
      }
      break;
    default:
      res.status(400).json({ success: false });
      break;
  }
}
