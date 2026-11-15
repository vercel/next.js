const port = Number(process.env.PORT ?? 3311)
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`

export function testUrl(path: string): string {
  return new URL(path, baseURL).toString()
}

export const origin = new URL(baseURL).origin
