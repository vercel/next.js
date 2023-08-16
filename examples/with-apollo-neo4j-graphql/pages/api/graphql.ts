import { ApolloServer } from '@apollo/server'
import { startServerAndCreateNextHandler } from '@as-integrations/next'
import { neoSchema } from '../../apollo/schema'

const server = async (): Promise<ApolloServer> => {
  const schema = await neoSchema.getSchema()
  return new ApolloServer({ schema })
}

export default startServerAndCreateNextHandler(await server())
