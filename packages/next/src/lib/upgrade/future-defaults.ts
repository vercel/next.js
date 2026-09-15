import type { NextConfig } from '../../server/config-shared'

type FutureDefault = {
  [Key in keyof NextConfig]-?: {
    key: Key
    value: Exclude<NextConfig[Key], undefined>
    availableSince: string
    guide: `${string}.md`
    skills: {
      adoption: string
      optimize: string | undefined
    }
  }
}[keyof NextConfig]

export const futureDefaults = [
  {
    key: 'cacheComponents',
    value: true,
    availableSince: '16.3.0',
    guide: '01-app/02-guides/migrating-to-cache-components.md',
    skills: {
      adoption: 'next-cache-components-adoption',
      optimize: 'next-cache-components-optimizer',
    },
  },
] as const satisfies readonly FutureDefault[]

export type FutureDefaultEntry = (typeof futureDefaults)[number]
