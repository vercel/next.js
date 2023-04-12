import React from 'react'
import type { AppProps } from 'next/app'
import type { NextPage } from 'next'

import { GitHubBanner, Refine } from '@refinedev/core'
import {
  ThemedLayout,
  notificationProvider,
  RefineThemes,
} from '@refinedev/antd'
import dataProvider from '@refinedev/simple-rest'
import routerProvider, {
  UnsavedChangesNotifier,
} from '@refinedev/nextjs-router'
import '@refinedev/antd/dist/reset.css'

import { ConfigProvider } from 'antd'
import '@styles/global.css'

import { authProvider } from 'src/authProvider'
import { API_URL } from '../src/constants'

export type ExtendedNextPage = NextPage & {
  noLayout?: boolean
}

type ExtendedAppProps = AppProps & {
  Component: ExtendedNextPage
}

export default function MyApp({
  Component,
  pageProps,
}: ExtendedAppProps): JSX.Element {
  const renderComponent = () => {
    if (Component.noLayout) {
      return <Component {...pageProps} />
    }

    return (
      <ThemedLayout>
        <Component {...pageProps} />
      </ThemedLayout>
    )
  }

  return (
    <>
      <GitHubBanner />
      <ConfigProvider theme={RefineThemes.Blue}>
        <Refine
          authProvider={authProvider}
          routerProvider={routerProvider}
          dataProvider={dataProvider(API_URL)}
          resources={[
            { name: 'users', list: '/users' },
            {
              name: 'posts',
              list: '/posts',
              create: '/posts/create',
              edit: '/posts/edit/:id',
              show: '/posts/show/:id',
              meta: {
                canDelete: true,
              },
            },
          ]}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
          }}
          notificationProvider={notificationProvider}
        >
          {renderComponent()}
          <UnsavedChangesNotifier />
        </Refine>
      </ConfigProvider>
    </>
  )
}
