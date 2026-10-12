async function getMessage() {
  'use cache: remote'

  return 'hello world'
}

export default async function Page() {
  return <p>{await getMessage()}</p>
}
