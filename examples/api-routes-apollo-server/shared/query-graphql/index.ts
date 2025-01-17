import { graphql } from "graphql";

import { schema } from "../../pages/api/graphql";

export default async function queryGraphql(query, variableValues = {}) {
  const { data } = await graphql({ schema, source: query, variableValues });
  return data || {};
}
