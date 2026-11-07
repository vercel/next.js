import type { AppType } from 'next/app'

type Extra = { foo: number }

const App: AppType<Extra> = (props) => {
  props.foo.toFixed() // expect OK: top-level extra prop present

  // expect error: pageProps should not have foo from Extra
  // @ts-expect-error
  props.pageProps.foo

  return null as any
}

export {}
