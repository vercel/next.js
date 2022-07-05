import { graphql, Source } from 'graphql'

import { schema } from '../../pages/api/graphql'

export default async function queryGraphql(
  query: string | Source,
  variableValues = {}
) {
  const { data } = (await graphql({
    schema,
    source: query,
    variableValues,
  })) as any
  return data || {}
}
