export default async function Page() {
  // eslint-disable-next-line no-unused-vars
  const { restUsed, ...rest } = await import('../../lib/rest-module')
  return <div>{restUsed()}</div>
}
