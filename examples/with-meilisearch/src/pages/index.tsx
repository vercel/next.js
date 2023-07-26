import React from 'react'
import Image from 'next/image'
import { Poppins } from 'next/font/google'
import {
  InstantSearch,
  Hits,
  Highlight,
  connectSearchBox,
} from 'react-instantsearch-dom'
import { instantMeiliSearch } from '@meilisearch/instant-meilisearch'

const poppins = Poppins({
  weight: ['700'],
  subsets: ['latin'],
  variable: '--font-poppins',
})

const searchClient = instantMeiliSearch(
  process.env.NEXT_PUBLIC_MEILISEARCH_HOST,
  process.env.NEXT_PUBLIC_MEILISEARCH_SEARCH_API_KEY
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
  <form noValidate action="" role="search" className="mb-12">
    <input
      type="search"
      value={currentRefinement}
      placeholder="Search Steam video games"
      onChange={(event) => refine(event.currentTarget.value)}
      className="w-full h-10 px-3 overflow-hidden rounded-lg shadow-md"
    />
    {isSearchStalled ? (
      <div className="my-5 text-center text-primary">Loading...</div>
    ) : (
      ''
    )}
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
