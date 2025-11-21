import { getReactConditionJson } from '../../lib/react-version'

// Adding URL dependency to edge api, it shouldn't break the build
console.log(
  'TEST_URL_DEPENDENCY',
  import(new URL('./style.css', import.meta.url).href)
)

export default async (_req) => {
  return Response.json(getReactConditionJson())
}

export const runtime = 'experimental-edge'
