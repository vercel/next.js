import type { NextConfigComplete } from '../../server/config-shared'

export type UpgradeDocument = `docs/${string}.md` | `skills/${string}/SKILL.md`

type FutureDefault = {
  name: string
  availableSince: string
  isAdopted(config: NextConfigComplete): boolean
  adoptionDoc: readonly UpgradeDocument[]
  optimizationDoc: readonly UpgradeDocument[]
}

export const futureDefaults = [
  {
    name: 'Cache Components',
    availableSince: '16.3.0',
    isAdopted: (config) => config.cacheComponents === true,
    adoptionDoc: [
      'docs/01-app/02-guides/migrating-to-cache-components.md',
      'skills/next-cache-components-adoption/SKILL.md',
    ],
    optimizationDoc: ['skills/next-cache-components-optimizer/SKILL.md'],
  },
  {
    name: 'Partial Prefetching',
    availableSince: '16.3.0',
    isAdopted: (config) => config.partialPrefetching === true,
    adoptionDoc: [
      'docs/01-app/02-guides/adopting-partial-prefetching.md',
      'skills/next-partial-prefetching-adoption/SKILL.md',
    ],
    optimizationDoc: ['skills/next-partial-prefetching-optimizer/SKILL.md'],
  },
] as const satisfies readonly FutureDefault[]

export type FutureDefaultEntry = (typeof futureDefaults)[number]
