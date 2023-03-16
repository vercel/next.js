export async function callServer(id: string, args: any[]) {
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
      bound: args,
    }),
  })

  return (await res.json())[0]
}
