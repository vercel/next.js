import { ImageResponse } from 'next/og'

export async function GET() {
  const responses = [
    new ImageResponse(<div>A</div>, { width: 64, height: 64 }),
    new ImageResponse(<div>B</div>, { width: 64, height: 64 }),
    new ImageResponse(<div>A</div>, { width: 96, height: 48 }),
  ]
  const images = await Promise.all(
    responses.map(async (response) =>
      Buffer.from(await response.arrayBuffer()).toString('base64')
    )
  )

  return Response.json(images)
}
