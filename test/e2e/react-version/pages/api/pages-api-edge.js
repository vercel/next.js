import { getReactConditionJson } from '../../lib/react-version'

export default async (_req) => {
  return Response.json(getReactConditionJson())
}

export const runtime = 'experimental-edge'
