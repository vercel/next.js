export default async function Page() {
  const { foo } = await import('some-module')
  return foo()
}
