import type {
  AppType,
  NextComponentType,
} from '../../../../../shared/lib/utils'

import React from 'react'

export function renderPageTree(
  App: AppType,
  Component: NextComponentType,
  props: any
): JSX.Element {
  return <App Component={Component} {...props} />
}
