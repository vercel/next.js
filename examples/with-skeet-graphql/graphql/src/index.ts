import { PrismaClient, User } from '@prisma/client'
import cors from 'cors'
import express from 'express'
import { json } from 'body-parser'
import http from 'http'
import { GraphQLError } from 'graphql'
import bodyParser from 'body-parser'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@apollo/server/express4'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { schema, permissions } from '@/schema'
import { applyMiddleware } from 'graphql-middleware'
import { InMemoryLRUCache } from '@apollo/utils.keyvaluecache'
import depthLimit from 'graphql-depth-limit'
import queryComplexity, { simpleEstimator } from 'graphql-query-complexity'
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default'
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled'
import { getLoginUser } from './lib/getLoginUser'
import { sleep } from '@skeet-framework/utils'

export type CurrentUser = Omit<User, 'id'> & { id: string }

interface Context {
  user?: CurrentUser
}

const prisma = new PrismaClient()

const PORT = process.env.PORT || 3000
const skeetEnv = process.env.NODE_ENV || 'development'

const queryComplexityRule = queryComplexity({
  maximumComplexity: 1000,
  variables: {},
  // eslint-disable-next-line no-console
  createError: (max: number, actual: number) =>
    new GraphQLError(
      `Query is too complex: ${actual}. Maximum allowed complexity: ${max}`
    ),
  estimators: [
    simpleEstimator({
      defaultComplexity: 1,
    }),
  ],
})

const allowedOrigins: string[] = []
if (process.env.NODE_ENV === 'production') {
  allowedOrigins.push('https://next-graphql.skeet.dev')
  allowedOrigins.push('https://skeet-graphql.web.app')
} else {
  allowedOrigins.push('http://localhost:3000')
  allowedOrigins.push('http://localhost:4200')
  new Array(10).fill(0).forEach((_, i) => {
    allowedOrigins.push(`http://localhost:1900${i}`)
  })
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
}

const endpoint = process.env.NODE_ENV === 'production' ? '/' : '/graphql'

const app = express()
const httpServer = http.createServer(app)
app.use(bodyParser.json())
app.use(cors<cors.CorsRequest>(corsOptions))
app.get('/root', (req, res) => {
  res.send('Skeet App is Running!')
})

export const server = new ApolloServer<Context>({
  schema: applyMiddleware(schema, permissions),
  cache: new InMemoryLRUCache({
    maxSize: Math.pow(2, 20) * 100,
    ttl: 300_000,
  }),
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    process.env.NODE_ENV === 'production'
      ? ApolloServerPluginLandingPageDisabled()
      : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
  ],
  validationRules: [depthLimit(7), queryComplexityRule],
  introspection: true,
})

export const startApolloServer = async () => {
  await server.start()
  app.use(
    endpoint,
    cors<cors.CorsRequest>(corsOptions),
    json(),
    expressMiddleware(server, {
      context: async ({ req }) => ({
        user: await getLoginUser<CurrentUser>(
          String(req.headers.authorization),
          prisma
        ),
        prisma,
      }),
    })
  )
}

export const expressServer = httpServer.listen(PORT, async () => {
  await startApolloServer()
  if (process.argv[2]) {
    await sleep(1000)
    process.exit()
  }
  console.log(
    `🚀 [API:${skeetEnv}]Server ready at http://localhost:${PORT}/graphql`
  )
})
