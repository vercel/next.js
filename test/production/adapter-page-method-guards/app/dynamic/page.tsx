export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  console.log('__app-dynamic-metadata__')
  return { title: 'app dynamic' }
}

export default async function Page() {
  console.log('__app-dynamic-rendered__')
  return <p>app dynamic page</p>
}
