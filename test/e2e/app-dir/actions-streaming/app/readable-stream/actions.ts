'use server'

export async function streamData(origin: string) {
  const response = await fetch(new URL('/readable-stream/api', origin))

  return response.body!
}
