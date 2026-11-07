export const revalidate = 10

export function generateStaticParams() {
  return []
}

export default async function Page({ params }) {
  const { slug } = await params

  return <p id="slug">{slug}</p>
}
