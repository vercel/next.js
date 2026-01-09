export function generateStaticParams() {
  return [{ userName: 'foobar' }]
}

export default function Page() {
  return <h1>Profile</h1>
}
