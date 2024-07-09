export function ErrorComponent({ name }: { name: string }) {
  throw new Error('Custom error:' + name)
  return null
}
