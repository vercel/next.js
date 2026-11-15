import type { ComponentType } from 'react'
import type { AppType } from './utils'

type PropsOf<T> = T extends ComponentType<infer P> ? P : never

describe('AppType generic (vercel/next.js#42846)', () => {
  it('applies the generic to App props, not pageProps', () => {
    expect(true).toBe(true)
  })
})

// Single generic: custom prop lives on App props, not under pageProps.
type MyApp = AppType<{ foo: string }>
type MyProps = PropsOf<MyApp>

function expectMyProps(props: MyProps) {
  const foo: string = props.foo
  const pageProps = props.pageProps
  const Component = props.Component
  const router = props.router
  void foo
  void pageProps
  void Component
  void router
}

// pageProps must not contain the custom prop (old buggy type put it there).
type PagePropsCheck = MyProps['pageProps'] extends { foo: any } ? 'BUG' : 'OK'
const pagePropsCheck: PagePropsCheck = 'OK'
void pagePropsCheck

// getInitialProps returns custom props plus the pageProps container.
const goodInitial: NonNullable<MyApp['getInitialProps']> = async () => ({
  foo: 'bar',
  pageProps: {},
})
void goodInitial

// Second generic optionally types pageProps.
type MyApp2 = AppType<{ foo: string }, { bar: string }>
type MyProps2 = PropsOf<MyApp2>

function expectMyProps2(props: MyProps2) {
  const foo: string = props.foo
  const bar: string = props.pageProps.bar
  void foo
  void bar
}

type PagePropsCheck2 = MyProps2['pageProps'] extends { foo: any }
  ? 'BUG'
  : 'OK'
const pagePropsCheck2: PagePropsCheck2 = 'OK'
void pagePropsCheck2

// Repro from the issue: props.foo exists, props.pageProps.foo does not.
declare const appProps: MyProps
const line13Ok: string = appProps.foo
// @ts-expect-error - props.pageProps.foo does not exist at runtime
const line14Bad = appProps.pageProps.foo
void line13Ok
void line14Bad
