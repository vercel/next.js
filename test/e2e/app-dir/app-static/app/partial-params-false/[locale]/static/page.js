export default async function Page({ params }) {
  const { locale } = await params
  return (
    <>
      <p>/[locale]/static</p>
      <p>locale: {locale}</p>
    </>
  )
}
