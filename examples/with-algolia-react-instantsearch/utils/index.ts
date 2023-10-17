import type { SearchState } from 'react-instantsearch-core'
import qs from 'qs'

export const createURL = (state: SearchState) => `?${qs.stringify(state)}`

export const pathToSearchState = (path: string) =>
  path.includes('?') ? qs.parse(path.substring(path.indexOf('?') + 1)) : {}

export const searchStateToURL = (searchState: SearchState) =>
  searchState ? `${window.location.pathname}?${qs.stringify(searchState)}` : ''
