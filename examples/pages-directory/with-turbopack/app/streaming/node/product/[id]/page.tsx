import {
  RecommendedProducts,
  RecommendedProductsSkeleton,
} from '#/app/streaming/_components/recommended-products'
import { Reviews, ReviewsSkeleton } from '#/app/streaming/_components/reviews'
import { SingleProduct } from '#/app/streaming/_components/single-product'
import { getBaseUrl } from '#/lib/getBaseUrl'
import { Ping } from '#/ui/ping'
import { Suspense } from 'react'

export default async function Page({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-8 lg:space-y-14">
      {/* @ts-expect-error Async Server Component */}
      <SingleProduct
        data={fetch(`${getBaseUrl()}/api/products?id=${params.id}`)}
      />

      <div className="relative">
        <div className="absolute top-2 -left-4">
          <Ping />
        </div>
      </div>

      <Suspense fallback={<RecommendedProductsSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <RecommendedProducts
          path="/streaming/node/product"
          data={fetch(
            // We intentionally delay the reponse to simulate a slow data
            // request that would benefit from streaming
            `${getBaseUrl()}/api/products?delay=500&filter=${params.id}`,
            {
              // We intentionally disable Next.js Cache to better demo
              // streaming
              cache: 'no-store',
            }
          )}
        />
      </Suspense>

      <div className="relative">
        <div className="absolute top-2 -left-4">
          <Ping />
        </div>
      </div>

      <Suspense fallback={<ReviewsSkeleton />}>
        {/* @ts-expect-error Async Server Component */}
        <Reviews
          data={fetch(
            // We intentionally delay the reponse to simulate a slow data
            // request that would benefit from streaming
            `${getBaseUrl()}/api/reviews?delay=1000`,
            {
              // We intentionally disable Next.js Cache to better demo
              // streaming
              cache: 'no-store',
            }
          )}
        />
      </Suspense>
    </div>
  )
}
