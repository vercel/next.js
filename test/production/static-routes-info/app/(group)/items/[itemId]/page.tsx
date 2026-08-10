// Route name: `/items/[itemId]` (the `(group)` segment is silent).
// The internal entry name in the client-reference manifest is
// `app/(group)/items/[itemId]/page` — note the `]` characters that
// appear unescaped inside the entry-key string. This fixture exists
// to exercise `parseClientReferenceManifest`'s string-literal walking
// for `]`-containing entry names; a naïve `[^\]]*` regex breaks here.
export default async function ItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { itemId } = await params
  return <p>item {itemId}</p>
}
