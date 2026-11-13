export function generateStaticParams() {
  return [{ parts: [] }, { parts: ['nested', 'path'] }]
}

// Awaiting params blocks the app shell; this fixture tests complete exports.
export const instant = false

export default async function Page({
  params,
}: {
  params: Promise<{ parts?: string[] }>
}) {
  const { parts } = await params
  return <p id="optional">Optional: {parts?.join('/') || 'root'}</p>
}
