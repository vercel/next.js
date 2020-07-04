import * as React from 'react'
import {
  SearchBox,
  Stack,
  IStackTokens,
  ISearchBoxStyles,
  getTheme,
  List,
  ISearchBox,
  Announced,
} from 'office-ui-fabric-react'
import { Layout } from '../components/layouts'

import { useSearchAddress } from '../hooks'
import { Address } from '../store/search'

const theme = getTheme()

const stackTokens: Partial<IStackTokens> = { childrenGap: 20 }

const searchBoxStyles: Partial<ISearchBoxStyles> = {
  root: {
    width: '50vw',
    height: '50px',
    lineHeight: '50px',
    border: `2px solid ${theme.palette.themePrimary}`,
    borderRadius: '5px',
  },
}

const formStyles: Partial<ISearchBoxStyles> = {
  root: {
    marginTop: '5vh',
    alignItems: 'center',
    justifyContent: 'center',
  },
}

export const Search = () => {
  const { searchAddress, searchAddressState } = useSearchAddress()
  const [value, setValue] = React.useState('')
  const [numberOfAddreses] = React.useState(0)
  const searchRef = React.useRef<ISearchBox>(null)

  const onSelectAddress = (item: Address) => {
    if (searchRef.current !== null) {
      searchRef.current.focus()
    }
    setValue(item.formattedAddress)
  }

  const onSearchInputChange = (newValue: string) => {
    searchAddress(newValue)
    setValue(newValue)
  }

  const onRenderCell = React.useCallback((item?: Address, index?: number) => {
    if (!item) {
      return null
    }
    return (
      <a href="#" key={index} onClick={() => onSelectAddress(item)}>
        {' '}
        {item?.formattedAddress}
      </a>
    )
  }, [])

  const renderAnnounced = (): JSX.Element | undefined => {
    if (searchAddressState.input?.trim() !== '') {
      return (
        <Announced
          message={
            numberOfAddreses === 1
              ? `${numberOfAddreses} address Found`
              : `${numberOfAddreses} addresses Found`
          }
        />
      )
    }
  }

  return (
    <Layout>
      <Stack tokens={stackTokens} as="form" styles={formStyles}>
        <SearchBox
          componentRef={searchRef}
          placeholder="Search your address"
          onChanged={(newValue: string) => onSearchInputChange(newValue)}
          styles={searchBoxStyles}
          value={value}
        />
        {renderAnnounced()}
        {searchAddressState.loading ? (
          <p>loadding...</p>
        ) : (
          <List
            items={searchAddressState.addresses}
            onRenderCell={onRenderCell}
          />
        )}
      </Stack>
    </Layout>
  )
}
