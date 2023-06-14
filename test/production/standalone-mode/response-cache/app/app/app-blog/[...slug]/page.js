export const revalidate = 1

export function generateStaticParams() {
  return [
    {
      slug: ['compare'],
    },
  ]
}

export default function Page({ params: { slug } }) {
  console.log('rendering app-blog')
  return (
    <>
      <p>/app-blog</p>
      <p>slug {JSON.stringify(slug)}</p>
      <p>Date: {Date.now()}</p>
    </>
  )
}
