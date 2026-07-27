export default async function Page({ params }) {
  const { locale, slug } = await params

  return (
    <>
      <p>/[locale]/[slug]/page</p>
      <p>params: {JSON.stringify({ locale, slug })}</p>
    </>
  )
}
