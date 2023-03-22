export async function callServer(id: string, bound: any[]) {
  const actionId = id

  // Fetching the current url with the action header.
  // TODO: Refactor this to look up from a manifest.
  const res = await fetch('', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Next-Action': actionId,
    },
    body: JSON.stringify({
      bound,
    }),
  })

  if (!res.ok) {
    throw new Error(await res.text())
  }

  return (await res.json())[0]
}
