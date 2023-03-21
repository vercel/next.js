// We want to trace this fetch in runtime
export const dynamic = 'force-dynamic'

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <p>app/loading/page</p>
}
