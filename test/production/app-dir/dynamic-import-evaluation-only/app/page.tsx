// Read through `globalThis` so the request stays a pattern the analyzer cannot fold to a single
// target, without pulling in runtime request data that cache components would reject.
async function loadLocale(locale: string) {
  // eslint-disable-next-line no-empty-pattern
  const {} = await import(`../locales/${locale}`)
}

export default async function Page() {
  // Nothing is destructured out of either result, so both resolve to
  // `ExportUsage::Evaluation`. The pattern import resolves to two targets of differing purity.
  // eslint-disable-next-line no-empty-pattern
  const {} = await import('../simple')
  await loadLocale((globalThis as { __locale?: string }).__locale ?? 'pure')

  return <p>hello world</p>
}
