export default async function Page({ params }) {
  const { lang } = await params
  return `Hello, ${lang} Dave!`
}
