import { leadingOnly } from '../lib/leading-only'
import { withTrailing } from '../lib/with-trailing'

const FILES = ['lib/leading-only.js', 'lib/with-trailing.js']

// The plugin stores each file's coverage map on `globalThis.__coverage__`
// (keyed by path, relative or absolute depending on the bundler). `fnMap` is
// empty when the ignore hint was honored.
function getInstrumentedFunctions(file: string): string[] {
  const coverage: Record<string, any> = (globalThis as any).__coverage__ ?? {}
  const key = Object.keys(coverage).find((path) => path.endsWith(file))
  if (!key) return ['<coverage map not found>']
  return Object.values(coverage[key].fnMap ?? {}).map((fn: any) => fn.name)
}

export default function Page() {
  return (
    <main>
      <ul>
        {FILES.map((file) => {
          const instrumented = getInstrumentedFunctions(file)
          return (
            <li key={file} id={file.replace(/[^a-z-]/g, '-')}>
              {instrumented.length === 0 ? 'honored' : instrumented.join(', ')}
            </li>
          )
        })}
      </ul>
      <p hidden>
        {leadingOnly()} {withTrailing()}
      </p>
    </main>
  )
}
