import produce from 'immer'
import { reducerWithInitialState } from 'typescript-fsa-reducers'
import {
  SearchAddressFailurePayload,
  SearchAddressSuccessPayload,
  SearchAddressPayload,
  SearchAddressActions,
} from './actions'

import { SearchAddressInitialState, SearchAddressState } from './states'

export const searchAddressReducer = reducerWithInitialState(
  SearchAddressInitialState
)
  .case(
    SearchAddressActions.clearAddress,
    (state: Readonly<SearchAddressState>): SearchAddressState => {
      return produce(state, (draft: SearchAddressState) => {
        draft.loading = false
        draft.addresses = []
        draft.input = ''
      })
    }
  )
  .case(
    SearchAddressActions.searchAddress,
    (
      state: Readonly<SearchAddressState>,
      payload: SearchAddressPayload
    ): SearchAddressState => {
      return produce(state, (draft: SearchAddressState) => {
        draft.loading = true
        draft.input = payload.input
      })
    }
  )
  .case(
    SearchAddressActions.searchAddressSuccess,
    (
      state: Readonly<SearchAddressState>,
      payload: SearchAddressSuccessPayload
    ): SearchAddressState => {
      const { addresses } = payload
      return produce(state, (draft: SearchAddressState) => {
        draft.addresses = addresses
        draft.loading = false
      })
    }
  )
  .case(
    SearchAddressActions.searchAddressFailure,
    (
      state: Readonly<SearchAddressState>,
      payload: SearchAddressFailurePayload
    ): SearchAddressState => {
      const { error } = payload
      return produce(state, (draft: SearchAddressState) => {
        draft.error = error
        draft.loading = false
      })
    }
  )
