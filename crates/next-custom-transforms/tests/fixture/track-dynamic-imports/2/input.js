export default async function Page() {
  await import((await import('get-name')).default)
  return null
}
