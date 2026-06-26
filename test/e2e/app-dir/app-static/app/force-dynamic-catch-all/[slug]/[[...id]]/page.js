export const dynamic = 'force-dynamic'
export const dynamicParams = true

export default async function Page() {
  return <h1>Dynamic catch-all route</h1>
}

export async function generateStaticParams() {
  return [
    {
      slug: 'slug',
      id: [],
    },
  ]
}
