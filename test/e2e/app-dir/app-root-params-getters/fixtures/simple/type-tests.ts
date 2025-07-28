import type { Expect, Equals } from './expect-type'

type _ = Expect<
  Equals<
    typeof import('next/root-params'),
    {
      lang: () => Promise<string | undefined>
      locale: () => Promise<string | undefined>
      path: () => Promise<string[] | undefined>
    }
  >
>
