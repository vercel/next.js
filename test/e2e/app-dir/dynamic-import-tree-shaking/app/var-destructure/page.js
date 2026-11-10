export default async function Page() {
  var { varUsed } = await import('../../lib/var-module')
  return <div>{varUsed()}</div>
}
