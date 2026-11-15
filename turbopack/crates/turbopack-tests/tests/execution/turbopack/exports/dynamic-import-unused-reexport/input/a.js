export async function a() {
  const { a } = await import('./b')
  return a()
}
