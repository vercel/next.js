// Type declaration for the test fixture. This is normally internal to the
// Next.js framework and not exposed to user code.
interface NextInvariants {
  readonly [key: string]: string | number | boolean | null
  readonly isDevServer: boolean
  readonly trailingSlash: boolean
  readonly experimentalOptimisticRouting: boolean
}

declare var __NEXT_INVARIANTS__: NextInvariants
