async function fetchChunk() {
  const controller = new AbortController()

  const response = await fetch(`http://localhost:${process.env.PORT}/api/sse`, {
    signal: controller.signal,
  })

  const reader = response.body!.getReader()
  const { value } = await reader.read()
  controller.abort()

  return new TextDecoder().decode(value)
}

export default async function Page() {
  const chunk = await fetchChunk()

  return <p>{chunk}</p>
}
