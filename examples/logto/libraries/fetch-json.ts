export default async function fetchJson<JSON = unknown>(
  input: RequestInfo,
  init?: RequestInit
): Promise<JSON> {
  const response = await fetch(input, init)

  const data = (await response.json()) as JSON

  if (response.ok) {
    return data
  }

  throw new Error(response.statusText)
}
