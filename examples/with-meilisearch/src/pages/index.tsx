import Image from 'next/image'
import React from 'react'
import {
  InstantSearch,
  Hits,
  Highlight,
  connectSearchBox,
} from 'react-instantsearch-dom'
import { instantMeiliSearch } from '@meilisearch/instant-meilisearch'

import { Poppins } from 'next/font/google'

const poppins = Poppins({
  weight: ['700'],
  subsets: ['latin'],
  variable: '--font-poppins',
})

// Update these credentials with your Meilisearch project
const searchClient = instantMeiliSearch(
  'https://ms-adf78ae33284-106.lon.meilisearch.io',
  'a63da4928426f12639e19d62886f621130f3fa9ff3c7534c5d179f0f51c4f303'
)

interface HitProps {
  hit: {
    name: string
    image: string
    description: string
    genres: string[]
  }
}

interface SearchBoxProps {
  currentRefinement: string
  isSearchStalled: boolean
  refine: Function
}

const SearchBox = ({
  currentRefinement,
  isSearchStalled,
  refine,
}: SearchBoxProps) => (
  <form
    noValidate
    action=""
    role="search"
    className="relative w-full h-10 mb-12 shadow-md group"
  >
    <input
      type="search"
      value={currentRefinement}
      placeholder="Search Steam video games"
      onChange={(event) => refine(event.currentTarget.value)}
      className="w-full h-full px-3 overflow-hidden rounded-lg"
    />
    {isSearchStalled ? 'My search is stalled' : ''}
  </form>
)

const CustomSearchBox = connectSearchBox(SearchBox)

const Hit = ({ hit }: HitProps) => {
  return (
    <div className="flex p-5 mb-5 space-x-8 bg-gray-100 border border-white/25 bg-opacity-5 backdrop-blur-sm rounded-xl">
      <Image
        src={hit.image}
        width={230}
        height={107.5}
        alt={hit.name + ' steam banner'}
        className="flex-shrink-0 rounded-xl"
      ></Image>
      <div className="flex flex-col justify-center">
        <div className="mb-3 text-lg leading-5 text-gray-100">
          <Highlight attribute="name" hit={hit} tagName="span" />
        </div>
        <div className="text-sm text-gray-300">
          <Highlight attribute="genres" hit={hit} tagName="span" />
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <main className="py-12 mx-3 font-sans sm:mx-auto sm:max-w-md">
      <h1
        className={`mb-12 text-4xl text-center text-primary font-title ${poppins.variable}`}
      >
        Meilisearch Starter
      </h1>
      <InstantSearch indexName="steam-video-games" searchClient={searchClient}>
        <CustomSearchBox />
        <Hits hitComponent={Hit} />
      </InstantSearch>
    </main>
  )
}
