export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; page: string[] }>
}) {
  const { lang, page } = await params
  return (
    <div>
      <h1 id="page-title">Dynamic Page</h1>
      <p id="lang">{lang}</p>
      <p id="page">{page.join('/')}</p>
    </div>
  )
}
