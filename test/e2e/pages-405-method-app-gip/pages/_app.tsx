import type { AppProps, AppContext } from 'next/app'

type CustomPageProps = { method: string }

export default function MyApp({
  Component,
  pageProps,
}: AppProps<CustomPageProps>) {
  return <Component {...pageProps} />
}

MyApp.getInitialProps = async (appCtx: AppContext) => {
  const { ctx } = appCtx
  return { pageProps: { method: ctx.req?.method ?? 'GET' } }
}
