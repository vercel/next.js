import neo4j from "neo4j-driver";

let driver;

const defaultOptions = {
  uri: process.env.NEO4J_URI,
  username: process.env.NEO4J_USER,
  password: process.env.NEO4J_PASSWORD,
};

export default function getDriver() {
  const { uri, username, password } = defaultOptions;
  if (!driver) {
    // Note: There is a disparity between Neo4j (Java) Integers and JavaScript integers
    // I have used `disableLosslessIntegers` to remove the need to call `.toNumber()` on each integer value
    // For more info see: https://github.com/neo4j/neo4j-javascript-driver/#numbers-and-the-integer-type
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      disableLosslessIntegers: true,
    });
  }

  return driver;
}
