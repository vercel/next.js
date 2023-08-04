import '@/lib/firebase'
import { type ReactElement, type ReactNode } from 'react'
import type { NextPage } from 'next'
import type { AppProps } from 'next/app'
import { appWithTranslation } from 'next-i18next'
import Layout from '@/layouts/Layout'
import { RecoilRoot } from 'recoil'
import Head from 'next/head'
import type { SeoData } from '@/lib/getStatic'
import 'highlight.js/styles/github-dark.css'
import '@/assets/styles/globals.css'
import { ThemeProvider } from 'next-themes'
import { RelayEnvironmentProvider } from 'react-relay'
import { createEnvironment } from '@/lib/relayEnvironment'

export type NextPageWithLayout = NextPage & {
  getLayout?: (page: ReactElement) => ReactNode
}

export type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout
}

function MyApp({ Component, pageProps, router }: AppProps) {
  return (
    <>
      <Head>
        <title>{pageProps.title}</title>
        {pageProps.seoData?.map((seo: SeoData, index: number) => (
          <meta {...seo} key={`metaSeo${index}`} />
        ))}
      </Head>
      <RecoilRoot>
        <RelayEnvironmentProvider environment={createEnvironment()}>
          <ThemeProvider attribute="class">
            <main className="min-h-screen scroll-smooth font-sans antialiased">
              <Layout
                Component={Component}
                pageProps={pageProps}
                router={router}
              />
            </main>
          </ThemeProvider>
        </RelayEnvironmentProvider>
      </RecoilRoot>
    </>
  )
}

export default appWithTranslation(MyApp)
