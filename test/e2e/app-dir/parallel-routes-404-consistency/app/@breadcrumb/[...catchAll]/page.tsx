export default async function BreadcrumbCatchAll({
  params,
}: {
  params: Promise<{ catchAll: string[] }>
}) {
  const { catchAll } = await params
  return <p>Breadcrumb: {catchAll.join('/')}</p>
}
