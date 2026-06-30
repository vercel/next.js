export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <div>Hello {(await params).slug}</div>
}

export async function generateStaticParams() {
  return []
}
