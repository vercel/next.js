import 'server-only'

export async function message(label: string) {
  return `Server fixture: ${await Promise.resolve(label)}`
}
