export default async function Page() {
  const { foo } = await import('some-module')
  // name conflict
  $$trackDynamicImport__()
  return foo()
}

export function $$trackDynamicImport__() {}
