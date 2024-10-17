import { getReactConditionJson } from '../../../lib/react-version'

export function GET() {
  return Response.json(getReactConditionJson())
}
