import { combineReducers } from 'redux'

import { searchAddressReducer } from './search/reducers'

export const combinedReducers = combineReducers({
  searchAddress: searchAddressReducer,
})

export type RootState = ReturnType<typeof combinedReducers>
