import { getReactConditionJson } from '../../lib/react-version'

export default async (_req, res) => {
  return res.json(getReactConditionJson())
}
