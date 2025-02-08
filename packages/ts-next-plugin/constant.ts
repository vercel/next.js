export const NEXT_TS_ERRORS = {
  INVALID_SERVER_API: 71001,
  INVALID_ENTRY_EXPORT: 71002,
  INVALID_OPTION_VALUE: 71003,
  MISPLACED_ENTRY_DIRECTIVE: 71004,
  INVALID_PAGE_PROP: 71005,
  INVALID_CONFIG_OPTION: 71006,
  INVALID_CLIENT_ENTRY_PROP: 71007,
  INVALID_METADATA_EXPORT: 71008,
  INVALID_ERROR_COMPONENT: 71009,
  INVALID_ENTRY_DIRECTIVE: 71010,
  INVALID_SERVER_ENTRY_RETURN: 71011,
}

export const ALLOWED_EXPORTS = [
  'config',
  'generateStaticParams',
  'metadata',
  'generateMetadata',
  'viewport',
  'generateViewport',
]

export const LEGACY_CONFIG_EXPORT = 'config'

export const DISALLOWED_SERVER_REACT_APIS: string[] = [
  'useState',
  'useEffect',
  'useLayoutEffect',
  'useDeferredValue',
  'useImperativeHandle',
  'useInsertionEffect',
  'useReducer',
  'useRef',
  'useSyncExternalStore',
  'useTransition',
  'Component',
  'PureComponent',
  'createContext',
  'createFactory',
  'experimental_useOptimistic',
  'useOptimistic',
  'useActionState',
]

export const DISALLOWED_SERVER_REACT_DOM_APIS: string[] = [
  'useFormStatus',
  'useFormState',
]

export const ALLOWED_PAGE_PROPS = ['params', 'searchParams']
export const ALLOWED_LAYOUT_PROPS = ['params', 'children']

export interface APIDoc {
  description: string
  options?: Record<string, string>
  link?: string
  type?: string
  isValid?: (value: string) => boolean
  getHint?: (value: any) => string | undefined
}

export const API_DOCS: Record<string, APIDoc> = {
  dynamic: {
    description:
      'The `dynamic` option provides a few ways to opt in or out of dynamic behavior.',
    options: {
      '"auto"':
        'Heuristic to cache as much as possible but doesn’t prevent any component to opt-in to dynamic behavior.',
      '"force-dynamic"':
        'This disables all caching of fetches and always revalidates. (This is equivalent to `getServerSideProps`.)',
      '"error"':
        'This errors if any dynamic Hooks or fetches are used. (This is equivalent to `getStaticProps`.)',
      '"force-static"':
        'This forces caching of all fetches and returns empty values from `cookies`, `headers` and `useSearchParams`.',
    },
    link: 'https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic',
  },
  fetchCache: {
    description:
      'The `fetchCache` option controls how Next.js statically caches fetches. By default it statically caches fetches reachable before any dynamic Hooks are used, and it doesn’t cache fetches that are discovered after that.',
    options: {
      '"force-no-store"':
        "This lets you intentionally opt-out of all caching of data. This option forces all fetches to be refetched every request even if the `cache: 'force-cache'` option is passed to `fetch()`.",
      '"only-no-store"':
        "This lets you enforce that all data opts out of caching. This option makes `fetch()` reject with an error if `cache: 'force-cache'` is provided. It also changes the default to `no-store`.",
      '"default-no-store"':
        "Allows any explicit `cache` option to be passed to `fetch()` but if `'default'`, or no option, is provided then it defaults to `'no-store'`. This means that even fetches before a dynamic Hook are considered dynamic.",
      '"auto"':
        'This is the default option. It caches any fetches with the default `cache` option provided, that happened before a dynamic Hook is used and don’t cache any such fetches if they’re issued after a dynamic Hook.',
      '"default-cache"':
        "Allows any explicit `cache` option to be passed to `fetch()` but if `'default'`, or no option, is provided then it defaults to `'force-cache'`. This means that even fetches before a dynamic Hook are considered dynamic.",
      '"only-cache"':
        "This lets you enforce that all data opts into caching. This option makes `fetch()` reject with an error if `cache: 'force-cache'` is provided. It also changes the default to `force-cache`. This error can be discovered early during static builds - or dynamically during Edge rendering.",
      '"force-cache"':
        "This lets you intentionally opt-in to all caching of data. This option forces all fetches to be cache even if the `cache: 'no-store'` option is passed to `fetch()`.",
    },
    link: 'https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#fetchcache',
  },
  preferredRegion: {
    description:
      'Specify the perferred region that this layout or page should be deployed to. If the region option is not specified, it inherits the option from the nearest parent layout. The root defaults to `"auto"`.\n\nYou can also specify a region, such as "iad1", or an array of regions, such as `["iad1", "sfo1"]`.',
    options: {
      '"auto"':
        'Next.js will first deploy to the `"home"` region. Then if it doesn’t detect any waterfall requests after a few requests, it can upgrade that route, to be deployed globally. If it detects any waterfall requests after that, it can eventually downgrade back to `"home`".',
      '"global"': 'Prefer deploying globally.',
      '"home"': 'Prefer deploying to the Home region.',
    },
    link: 'https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#preferredregion',
    isValid: (value: string) => {
      try {
        const parsed = JSON.parse(value)
        return (
          typeof parsed === 'string' ||
          (Array.isArray(parsed) && !parsed.some((v) => typeof v !== 'string'))
        )
      } catch (err) {
        return false
      }
    },
    getHint: (value: any) => {
      if (value === 'auto') return `Automatically chosen by Next.js.`
      if (value === 'global') return `Prefer deploying globally.`
      if (value === 'home') return `Prefer deploying to the Home region.`
      if (Array.isArray(value)) return `Deploy to regions: ${value.join(', ')}.`
      if (typeof value === 'string') return `Deploy to region: ${value}.`
    },
  },
  revalidate: {
    description:
      'The `revalidate` option sets the default revalidation time for that layout or page. Note that it doesn’t override the value specify by each `fetch()`.',
    type: 'mixed',
    options: {
      false:
        'This is the default and changes the fetch cache to indefinitely cache anything that uses force-cache or is fetched before a dynamic Hook/fetch.',
      0: 'Specifying `0` implies that this layout or page should never be static.',
      30: 'Set the revalidation time to `30` seconds. The value can be `0` or any positive number.',
    },
    link: 'https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#revalidate',
    isValid: (value: string) => {
      return value === 'false' || Number(value.replace(/_/g, '')) >= 0
    },
    getHint: (value: any) => {
      return `Set the default revalidation time to \`${value}\` seconds.`
    },
  },
  dynamicParams: {
    description:
      '`dynamicParams` replaces the `fallback` option of `getStaticPaths`. It controls whether we allow `dynamicParams` beyond the generated static params from `generateStaticParams`.',
    options: {
      true: 'Allow rendering dynamic params that are not generated by `generateStaticParams`.',
      false:
        'Disallow rendering dynamic params that are not generated by `generateStaticParams`.',
    },
    link: 'https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamicparams',
    isValid: (value: string) => {
      return value === 'true' || value === 'false'
    },
  },
  runtime: {
    description:
      'The `runtime` option controls the preferred runtime to render this route.',
    options: {
      '"nodejs"': 'Prefer the Node.js runtime.',
      '"edge"': 'Prefer the Edge runtime.',
      '"experimental-edge"': `@deprecated\n\nThis option is no longer experimental. Use \`edge\` instead.`,
    },
    link: 'https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#runtime',
  },
  metadata: {
    description: 'Next.js Metadata configurations',
    link: 'https://nextjs.org/docs/app/building-your-application/optimizing/metadata',
  },
  maxDuration: {
    description:
      '`maxDuration` allows you to set max default execution time for your function. If it is not specified, the default value is dependent on your deployment platform and plan.',
    link: 'https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#maxduration',
  },
  experimental_ppr: {
    description: `Enables experimental Partial Prerendering (PPR) for this page / layout, when PPR is set to "incremental" mode.`,
    link: 'https://nextjs.org/docs/app/api-reference/next-config-js/ppr',
    options: {
      true: 'Enable PPR for this route',
      false: 'Disable PPR for this route',
    },
    isValid: (value: string) => {
      return value === 'true' || value === 'false'
    },
  },
} satisfies Record<
  string,
  APIDoc
>
