export const revalidate = 120

export function generateStaticParams() {
  return [
    {
      slug: 'first',
    },
  ]
}

export default function Page({ params }) {
  return (
    <>
      <p>/app-ssg/[slug]</p>
      <p>{JSON.stringify(params)}</p>
    </>
  )
}
