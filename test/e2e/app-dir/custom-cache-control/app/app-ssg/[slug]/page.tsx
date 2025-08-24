export const revalidate = 120

export function generateStaticParams() {
  return [
    {
      slug: 'first',
    },
  ]
}

export default async function Page(props) {
  const params = await props.params
  return (
    <>
      <p>/app-ssg/[slug]</p>
      <p>{JSON.stringify(params)}</p>
    </>
  )
}
