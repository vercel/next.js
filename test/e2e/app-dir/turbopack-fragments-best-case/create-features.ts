import { createHash } from 'crypto'

export function createFeatureFiles() {
  const files: Record<string, string> = {}
  const features: string[] = []
  for (let feature = 0; feature < 16; feature++) {
    // Large independent datasets make per-feature chunk splitting observable.
    const data = Array.from({ length: 256 }, (_, index) =>
      createHash('sha256').update(`${feature}:${index}`).digest('hex')
    )
    files[`lib/data-${feature}.ts`] =
      `export const data = ${JSON.stringify(data)}\n`
    features.push(`
      import { data as data${feature} } from './data-${feature}'
      export function feature${feature}(index: number) {
        return 'feature-${feature}:' + data${feature}[index % data${feature}.length]
      }
    `)
    files[`app/feature-${feature}/page.tsx`] = `
      import { feature${feature} } from '../../lib/features'
      export default async function Page({ searchParams }: {
        searchParams: Promise<{ index?: string }>
      }) {
        const { index } = await searchParams
        return <p>{feature${feature}(Number(index ?? 0))}</p>
      }
    `
  }
  files['lib/features.ts'] = features.join('\n')
  return files
}
