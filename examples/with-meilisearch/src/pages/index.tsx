import Image from 'next/image'
import React from 'react'
import {
  InstantSearch,
  SearchBox,
  Hits,
  Highlight,
} from 'react-instantsearch-dom'
import { instantMeiliSearch } from '@meilisearch/instant-meilisearch'
import '../styles/globals.css'

const searchClient = instantMeiliSearch(
  'https://ms-adf78ae33284-106.lon.meilisearch.io',
  'a63da4928426f12639e19d62886f621130f3fa9ff3c7534c5d179f0f51c4f303'
)

const Hit = ({ hit }) => <Highlight attribute="name" hit={hit} />

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-between min-h-screen p-24">
      <InstantSearch indexName="steam-video-games" searchClient={searchClient}>
        <SearchBox />
        <Hits hitComponent={Hit} />
      </InstantSearch>
    </main>
  )
}
