async function getPrivate() {
  'use cache: private'
  return 'private-value'
}

export default async function Page() {
  return <p>{await getPrivate()}</p>
}
