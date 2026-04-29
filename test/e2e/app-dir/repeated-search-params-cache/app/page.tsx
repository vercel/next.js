import { Suspense } from 'react'

type SearchParams = Record<string, string | string[] | undefined>

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const resolved = await searchParams
  const colorParam = resolved['color']
  const colors = !colorParam
    ? []
    : Array.isArray(colorParam)
      ? colorParam
      : [colorParam]

  return (
    <Suspense key={colors.join(',')} fallback={<p id="fallback">loading...</p>}>
      <ColorList colors={colors} />
    </Suspense>
  )
}

async function ColorList({ colors }: { colors: string[] }) {
  // Small delay so the Suspense fallback is observable on slow machines
  // but the test still completes quickly. Not strictly required for the
  // regression — the bug also manifests as the result list never updating.
  await new Promise((resolve) => setTimeout(resolve, 100))
  return (
    <ul id="result">
      {colors.map((color) => (
        <li key={color}>{color}</li>
      ))}
    </ul>
  )
}
