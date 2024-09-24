"use client";

import algoliasearch from "algoliasearch/lite";
import type { Hit as AlgoliaHit } from "instantsearch.js";
import React from "react";
import {
  Configure,
  Highlight,
  Hits,
  Pagination,
  RefinementList,
  SearchBox,
} from "react-instantsearch";
import { InstantSearchNext } from "react-instantsearch-nextjs";

import { Panel } from "./Panel";

type HitProps = {
  hit: AlgoliaHit<{
    name: string;
    description: string;
    price: number;
  }>;
};

const APP_ID = "latency";
const API_KEY = "6be0576ff61c053d5f9a3225e2a90f76";
const INDEX_NAME = "instant_search";

const searchClient = algoliasearch(APP_ID, API_KEY);

function Hit({ hit }: HitProps) {
  return (
    <>
      <Highlight hit={hit} attribute="name" className="Hit-label" />
      <span className="Hit-price">${hit.price}</span>
    </>
  );
}

export default function Search() {
  return (
    <InstantSearchNext
      searchClient={searchClient}
      indexName={INDEX_NAME}
      routing
      future={{
        preserveSharedStateOnUnmount: true,
      }}
    >
      <Configure hitsPerPage={12} />
      <main>
        <div>
          <Panel header="Brands">
            <RefinementList attribute="brand" showMore />
          </Panel>
        </div>
        <div>
          <SearchBox />
          <Hits hitComponent={Hit} />
          <Pagination />
        </div>
      </main>
    </InstantSearchNext>
  );
}
