async function getMessage() {
  'use cache'
  return 'hello-from-use-cache'
}

export default async function Page() {
  return <p>{await getMessage()}</p>
}
