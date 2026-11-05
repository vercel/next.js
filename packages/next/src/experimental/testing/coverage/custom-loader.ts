let entry: string | undefined

export function initialize(options: { entry: string }) {
  entry = options.entry
}

export function assertProviderImport(
  provider: string,
  parentURL: string | undefined,
  url: string
) {
  if (parentURL === provider && url !== provider && !url.startsWith('node:'))
    throw new Error(
      'Custom coverage provider helper imports are unqualified; use a single JavaScript provider entry and Node builtins.'
    )
}

export async function resolve(
  specifier: string,
  context: { parentURL?: string },
  nextResolve: (
    specifier: string,
    context: { parentURL?: string }
  ) => Promise<{ url: string }>
) {
  const result = await nextResolve(specifier, context)
  if (entry) assertProviderImport(entry, context.parentURL, result.url)
  return result
}
