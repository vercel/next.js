export default async function Page() {
  let { letUsed } = await import('../../lib/let-module')
  return <div>{letUsed()}</div>
}
