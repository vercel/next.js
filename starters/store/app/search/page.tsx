import { Suspense } from "react";
import {
  SearchBox,
  SearchBoxFallback,
} from "@/features/products/components/search-box";
import {
  SearchResults,
  SearchResultsSkeleton,
} from "@/features/products/components/search-results";

export const prefetch = "allow-runtime";

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Search</h1>
      <div className="mt-4">
        <Suspense fallback={<SearchBoxFallback />}>
          {searchParams.then(({ q }) => (
            <SearchBox initialQuery={typeof q === "string" ? q : ""} />
          ))}
        </Suspense>
      </div>
      <Suspense fallback={<SearchResultsSkeleton />}>
        {searchParams.then(({ q }) => (
          <SearchResults query={typeof q === "string" ? q : ""} />
        ))}
      </Suspense>
    </>
  );
}
