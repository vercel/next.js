import { resetCachedValue } from '../../cached-value'

export async function POST() {
  const newValue = await resetCachedValue()
  return Response.json(newValue)
}
