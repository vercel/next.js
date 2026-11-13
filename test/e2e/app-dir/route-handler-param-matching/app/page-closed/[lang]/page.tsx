export default async function Page({
  params,
}: PageProps<'/page-closed/[lang]'>) {
  return <p>Page language: {(await params).lang}</p>
}
