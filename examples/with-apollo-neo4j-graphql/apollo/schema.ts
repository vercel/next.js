import { Neo4jGraphQL } from '@neo4j/graphql'
import typeDefs from './type-defs'
import getDriver from '../util/neo4j'

const driver = getDriver()

export const neoSchema = new Neo4jGraphQL({
  typeDefs,
  driver,
})
