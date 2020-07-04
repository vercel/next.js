import { useCallback } from 'react'

import { useDispatch, useSelector } from 'react-redux'
import {
  SearchAddressState,
  searchAddressSelector,
  SearchAddressActions,
} from '../store/search'

type SearchAddressOperators = {
  searchAddress: (inputValue: string) => void
  searchAddressState: SearchAddressState
}

/**
 * Debounce and throttle custom-hooks
 * @see https://reactjs.org/docs/hooks-custom.html
 */
export const useSearchAddress = (): Readonly<SearchAddressOperators> => {
  const dispatch = useDispatch()
  const searchAddressState = useSelector(searchAddressSelector)

  const handleSearchAddress = useCallback(
    (inputValue: string) => {
      if (inputValue.trim() === '') {
        dispatch(SearchAddressActions.clearAddress())
        return
      }
      dispatch(
        SearchAddressActions.searchAddress({
          input: inputValue,
        })
      )
    },
    [dispatch]
  )

  return {
    searchAddress: handleSearchAddress,
    searchAddressState: searchAddressState,
  }
}
