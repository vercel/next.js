import type { Expect, Equals } from './expect-type'

type _ = Expect<
  Equals<
    typeof import('next/root-params'),
    {
      id: () => Promise<string | undefined>
      // new types will be patched in here when a test adds new root params
    }
  >
>
