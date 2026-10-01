import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { moduleUrl } from '../../../linked/root-info.mjs'

// Runs in a build worker, which must also resolve the source location.
export function generateStaticParams() {
  const source = readFileSync(fileURLToPath(moduleUrl), 'utf8')
  if (!source.includes('export const moduleUrl = import.meta.url')) {
    throw new Error(`Could not read additional-root source: ${moduleUrl}`)
  }
  return [{ slug: 'test' }]
}

export default function Page() {
  return <p id="static-root">additional root static params</p>
}
