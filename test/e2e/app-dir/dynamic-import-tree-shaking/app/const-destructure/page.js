export default async function Page() {
  const { constUsed } = await import('../../lib/const-module')
  return <div>{constUsed()}</div>
}
