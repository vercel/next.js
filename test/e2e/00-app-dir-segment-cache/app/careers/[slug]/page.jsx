import { redirect } from 'next/navigation'

export const generateStaticParams = async () => {
  return []
}

export default async function Page({ params }) {
  const { slug } = await params

  console.log({ slug })

  if (!slug.includes('foobar')) {
    redirect('/careers')
  }

  return <div>Result Page: {slug}</div>
}
