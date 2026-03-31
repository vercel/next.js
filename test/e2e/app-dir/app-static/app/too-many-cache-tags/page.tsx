export const revalidate = 0

export default async function Page() {
  const tags: string[] = []

  for (let i = 0; i < 130; i++) {
    tags.push(`tag-${i}`)
  }
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: { tags },
    }
  ).then((res) => res.text())

  return (
    <>
      <p>too-many-cache-tags</p>
      <p>{data}</p>
    </>
  )
}
