import { createSelector } from 'reselect'

export const selectUsersDomain = state => state.example

export const selectData = createSelector(
  selectUsersDomain,
  subState => subState || []
)
