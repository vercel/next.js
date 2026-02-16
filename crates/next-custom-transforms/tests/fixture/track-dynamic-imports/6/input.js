const { foo } = import('some-module')

export default async function Page() {
  const { bar } = await foo
  return bar()
}
