import { HttpLink } from 'apollo-link-http'
import fetch from 'isomorphic-unfetch'
import { introspectSchema, makeRemoteExecutableSchema } from 'graphql-tools'

const link = new HttpLink({
  uri: 'https://api.graph.cool/simple/v1/cixmkt2ul01q00122mksg82pn',
  credentials: 'same-origin',
  fetch,
})

export const introspect = async () => {
  const schema = await introspectSchema(link)

  const executableSchema = makeRemoteExecutableSchema({
    schema,
    link,
  })

  console.log('executableSchema', executableSchema)

  return executableSchema
}
