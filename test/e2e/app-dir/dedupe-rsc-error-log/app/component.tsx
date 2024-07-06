async function getData(name: string) {
  throw new Error('Custom error:' + name)
}

export async function ErrorComponent({ name }: { name: string }) {
  await getData(name)
  return null
}
