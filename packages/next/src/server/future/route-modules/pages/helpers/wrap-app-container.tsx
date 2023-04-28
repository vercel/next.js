import type { ServerRouter } from './server-router'

import React from 'react'
import { AppRouterContext } from '../../../../../shared/lib/app-router-context'
import {
  PathnameContext,
  SearchParamsContext,
} from '../../../../../shared/lib/hooks-client-context'
import {
  adaptForAppRouterInstance,
  adaptForPathname,
  adaptForSearchParams,
} from '../../../../../shared/lib/router/adapters'

export type WrapAppContainerOptions = {
  router: ServerRouter
  isAutoExport: boolean
  isDynamic: boolean
}

type Component = (props: { children: JSX.Element }) => JSX.Element

export function wrapAppContainer(
  AppContainer: Component,
  options: WrapAppContainerOptions
): Component {
  const router = adaptForAppRouterInstance(options.router)
  const searchParams = adaptForSearchParams(options.router)
  const pathname = adaptForPathname(
    options.router,
    options.isAutoExport,
    options.isDynamic
  )

  return (props: { children: JSX.Element }): JSX.Element => (
    <AppRouterContext.Provider value={router}>
      <SearchParamsContext.Provider value={searchParams}>
        <PathnameContext.Provider value={pathname}>
          <AppContainer>{props.children}</AppContainer>
        </PathnameContext.Provider>
      </SearchParamsContext.Provider>
    </AppRouterContext.Provider>
  )
}
