import { updateCachedValue } from '../../cached-value'

export async function POST() {
  const newValue = await updateCachedValue()
  return Response.json(newValue)
}
