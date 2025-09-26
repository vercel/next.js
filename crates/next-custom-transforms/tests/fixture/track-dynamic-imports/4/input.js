const promise = import('some-module')

export default async function Page() {
  const { foo } = await promise
  return foo()
}
