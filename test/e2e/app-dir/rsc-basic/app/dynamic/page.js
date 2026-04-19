export default async function Page() {
  const dynamic = '_dynamic'
  const { default: Component } = await import(`./${dynamic}.js`)
  return <Component />
}
