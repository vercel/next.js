import { ApolloServer } from '@apollo/server'
import { startServerAndCreateNextHandler } from '@as-integrations/next'
import { NextApiRequest, NextApiResponse } from 'next'
import { schema } from '../../apollo/schema'

type ExampleContext = {
  req: NextApiRequest
  res: NextApiResponse
}

const apolloServer = new ApolloServer<ExampleContext>({ schema })

export default startServerAndCreateNextHandler(apolloServer, {
  context: async (req, res) => ({ req, res }),
})
