export default async function Page() {
  await import('./some-file')
  // name conflict
  $$trackDynamicImport__()
  return null
}

export function $$trackDynamicImport__() {}
