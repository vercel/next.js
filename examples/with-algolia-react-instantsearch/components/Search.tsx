import singletonRouter from 'next/router';
import { createInstantSearchRouterNext } from 'react-instantsearch-hooks-router-nextjs';
import { Hit as AlgoliaHit } from 'instantsearch.js';
import {
  RefinementList,
  SearchBox,
  Hits,
  Configure,
  Highlight,
  Pagination,
  InstantSearch,
  InstantSearchProps,
  InstantSearchServerState,
  InstantSearchSSRProvider,
} from 'react-instantsearch-hooks-web'

type HitProps = {
  hit: AlgoliaHit<{
    name: string;
    price: number;
    type: string;
    description: string;
    image: string;
    rating: number;
  }>;
};

const HitComponent = ({ hit }: HitProps) => (
  <div className="hit">
    <div>
      <div className="hit-picture">
        <img src={`${hit.image}`} />
      </div>
    </div>
    <div className="hit-content">
      <div>
        <Highlight attribute="name" hit={hit} />
        <span> - ${hit.price}</span>
        <span> - {hit.rating} stars</span>
      </div>
      <div className="hit-type">
        <Highlight attribute="type" hit={hit} />
      </div>
      <div className="hit-description">
        <Highlight attribute="description" hit={hit} />
      </div>
    </div>
  </div>
)

export type InstantSearchSSRProps = {
  serverState?: InstantSearchServerState;
  serverUrl?: string
}

export type SearchProps = InstantSearchProps & InstantSearchSSRProps

export function Search(props: SearchProps) {
  const { serverState, serverUrl, ...instantSearchProps } = props;

  return (
    <InstantSearchSSRProvider {...serverState}>
      <InstantSearch {...instantSearchProps} routing={{
          router: createInstantSearchRouterNext({ singletonRouter, serverUrl }),
        }}>
        <Configure hitsPerPage={12} />
        <header>
          <h1>React InstantSearch Hooks + Next.js</h1>
          <SearchBox />
        </header>
        <main>
          <div className="menu">
            <RefinementList attribute="categories" />
          </div>
          <div className="results">
            <Hits hitComponent={HitComponent} />
          </div>
        </main>
        <footer>
          <Pagination />
        </footer>
      </InstantSearch>
    </InstantSearchSSRProvider>
  )
}
