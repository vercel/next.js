export default async function Page() {
  const { renameUsed: myFunc } = await import('../../lib/rename-module')
  return <div>{myFunc()}</div>
}
