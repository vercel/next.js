import { getGeneratorValue } from '../../generator-value'

export async function generateImageMetadata() {
  return [{ id: await getGeneratorValue('image'), contentType: 'image/png' }]
}

export default async function Image({ id }: { id: Promise<string> }) {
  return new Response(await id, {
    headers: { 'content-type': 'image/png' },
  })
}
