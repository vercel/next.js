export default async function Page() {
  const memberUsed = (await import('../../lib/member-module')).memberUsed
  return <div>{memberUsed()}</div>
}
