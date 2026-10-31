export default async function DocsCatchAll({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  return (
    <div id="app-catchall" data-slug={slug === undefined ? '' : slug.join('/')}>
      APP CATCHALL
    </div>
  )
}
