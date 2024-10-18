export default function Page({
  params: { slug },
}: {
  params: { slug: string[] }
}) {
  return <p>{slug?.[0]}</p>
}
