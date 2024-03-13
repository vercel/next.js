import { EmptyPlaceholder } from "@/components/empty-placeholder"
import { SearchResultsSelector } from "@/components/page-size-select"
import { PaginationButton } from "@/components/pagination-button"
import { ResultCardImage } from "@/components/result-card-image"
import { SearchInput } from "@/components/search-input"
import { Shell } from "@/components/shell"
import { Skeleton } from "@/components/skeleton"
import { searchIndex } from "@/lib/utils"
import { TIndexSearch, indexSearchSchema } from "@/lib/validations/index-search"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from "@radix-ui/react-icons"
import { Suspense } from "react"
import dynamic from 'next/dynamic'

const ReactJsonView = dynamic(() => import('@/components/react-json-view'), {
  ssr: false,
  loading: () => <Skeleton className="h-[150px] w-full" />,
})

export interface HomePageProps {
  searchParams: TIndexSearch
}

const API_KEY = process.env.OBJECTIVE_API_KEY as string
const INDEX_ID = process.env.OBJECTIVE_INDEX_ID as string

export default async function CatalogPage({
  searchParams,
}: HomePageProps) {
  const params = searchParams || {}
  const { offset, limit, query, filterQuery, view } =
    indexSearchSchema.parse(params)

  const data = await searchIndex({
    apiKey: API_KEY,
    apiHostName: "api.objective.inc",
    query,
    filterQuery,
    object_fields: "*",
    indexId: INDEX_ID,
    debug: false,
    limit,
    offset,
    view,
  })

  const { pagination } = data;

  const isFirstPage = pagination.page === 1
  const isLastPage = pagination.page === pagination.pages - 1

  return (
    <Shell className="max-w-7xl">
      <SearchInput />
      <div className="mt-8">
        {data?.results?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-3 gap-6">
            {data?.results.map((result: any) => (
              <div key={result.id}>
                <div className="overflow-auto max-h-[600px] border shadow-sm rounded-lg">
                  <Suspense
                    fallback={<Skeleton className="h-[192px] w-full" />}
                  >
                    <ResultCardImage object={result} />
                  </Suspense>
                  <ReactJsonView data={result} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPlaceholder>
            <EmptyPlaceholder.Icon name="packageOpen" />
            <EmptyPlaceholder.Title>
              No search results found
            </EmptyPlaceholder.Title>
            <EmptyPlaceholder.Description className="mb-0">
              Enter a query to see results from your Index
            </EmptyPlaceholder.Description>
          </EmptyPlaceholder>
        )}
        {pagination?.pages > 1 && (
          <div className="flex items-center justify-between px-2 mt-16">
            <div className="flex-1 text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.pages - 1}
            </div>
            <div className="flex items-center space-x-6 lg:space-x-8">
              <div className="items-center space-x-2 hidden lg:flex">
                <p className="text-sm font-medium">Rows per page</p>
                <SearchResultsSelector />
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-2">
                  <PaginationButton
                    disabled={isFirstPage}
                    href={`/?query=${query}&offset=0&limit=${limit}`}
                    ariaLabel="Go to first page"
                    IconComponent={DoubleArrowLeftIcon}
                  />
                  <PaginationButton
                    disabled={isFirstPage}
                    href={`/?query=${query}&offset=${pagination?.prev?.offset ?? 0}&limit=${limit}`}
                    ariaLabel="Go to previous page"
                    IconComponent={ChevronLeftIcon}
                  />
                  <PaginationButton
                    disabled={isLastPage}
                    href={`/?query=${query}&offset=${pagination?.next?.offset}&limit=${limit}`}
                    ariaLabel="Go to next page"
                    IconComponent={ChevronRightIcon}
                  />
                  <PaginationButton
                    disabled={isLastPage}
                    href={`/?query=${query}&offset=${pagination.pages * limit - limit}&limit=${limit}`}
                    ariaLabel="Go to last page"
                    IconComponent={DoubleArrowRightIcon}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}