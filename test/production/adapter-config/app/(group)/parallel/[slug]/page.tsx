export const dynamicParams = false
export function generateStaticParams() {
  return [{ slug: 'known' }]
}
export default function Page() {
  return <p>closed parallel children page</p>
}
