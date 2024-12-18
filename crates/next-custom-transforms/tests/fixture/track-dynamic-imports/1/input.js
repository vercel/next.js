export default async function Page() {
  await import('./some-file')
  return null
}
