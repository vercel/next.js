import type { InferGetServerSidePropsType, GetServerSideProps } from 'next'
import type { SearchState } from 'react-instantsearch-core'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import algoliasearch from 'algoliasearch/lite'
import { findResultsState } from 'react-instantsearch-dom/server'
import { Search } from '../components/Search'
import { createURL, searchStateToURL, pathToSearchState } from '../utils'

// Demo key provided by https://github.com/algolia/react-instantsearch
const searchClient = algoliasearch(
  'latency',
  '6be0576ff61c053d5f9a3225e2a90f76'
)

const defaultProps = {
  searchClient,
  indexName: 'instant_search',
}

export default function Page({
  resultsState,
  searchState: initialState,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter()
  const debouncedSetState = useRef()
  const [searchState, setSearchState] = useState(initialState)

  const onSearchStateChange = (state: SearchState) => {
    clearTimeout(debouncedSetState.current)
    ;(debouncedSetState as any).current = setTimeout(() => {
      const href = searchStateToURL(state)

      router.push(href, href, { shallow: true })
    }, 700)

    setSearchState(state)
  }

  useEffect(() => {
    if (router) {
      router.beforePopState((state: SearchState) => {
        const { url } = state
        setSearchState(pathToSearchState(url))

        return true
      })
    }
  }, [router])

  return (
    <Search
      {...defaultProps}
      searchState={searchState}
      resultsState={resultsState}
      onSearchStateChange={onSearchStateChange}
      createURL={createURL}
    />
  )
}

interface PageProps {
  searchState: SearchState
  resultsState: unknown
}

export const getServerSideProps: GetServerSideProps<PageProps> = async ({
  resolvedUrl,
}) => {
  const searchState = pathToSearchState(resolvedUrl)
  const resultsState = await findResultsState(Search, {
    ...defaultProps,
    searchState,
  })

  // Pre-serialize `findResultsState` object return so Next.js' serialization checks pass
  // https://github.com/vercel/next.js/issues/11993
  return {
    props: {
      resultsState: JSON.parse(JSON.stringify(resultsState)),
      searchState,
    },
  }
}
