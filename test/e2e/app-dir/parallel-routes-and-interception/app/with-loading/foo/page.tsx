// we want to verify that the loading behavior is triggered during Next build, so we opt out of static generation
export const dynamic = 'force-dynamic'

export default async function TestPage() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return <div>Welcome to Foo Page</div>
}
