export default async function Page() {
  let mod
  mod = await import('../../lib/reassign-module')
  return <div>{mod.reassignUsed()}</div>
}
