async function getMessage() {
  'use cache'
  return 'hello from cache'
}

export default async function Page() {
  return <p>{await getMessage()}</p>
}
