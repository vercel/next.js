import neo4j from 'neo4j-driver'

let driver

const defaultOptions = {
  uri: process.env.NEO4J_URI,
  username: process.env.NEO4J_USER,
  password: process.env.NEO4J_PASSWORD,
}

export default function getDriver() {
  const { uri, username, password } = defaultOptions
  if (!driver) {
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password))
  }

  return driver
}
