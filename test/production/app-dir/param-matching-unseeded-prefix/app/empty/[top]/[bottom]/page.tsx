export const experimental_paramMatching = {
  bottom: 'fallback',
} as const

// There are no example params to validate a more specific shell. Opt out of
// instant validation so this test can inspect the inferred empty-shell mode.
export const instant = false

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p>{`${top}/${bottom}`}</p>
}
