export function generateStaticParams() {
  return [{ param: 'foo' }]
}
export const revalidate = 120

export default function Page() {
  console.log('RENDERING RENDERING RENDERING RENDERING')
  return <p>Hello Cached</p>
}
