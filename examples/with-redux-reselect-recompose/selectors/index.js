import { createSelector } from 'reselect'

export const selectState = () => state => state.count

export const selectCount = () => createSelector(
  selectState(),
  count => count.count
)

export const selectLight = () => createSelector(
  selectState(),
  count => count.light
)

export const selectLastUpdate = () => createSelector(
  selectState(),
  count => count.lastUpdate
)
