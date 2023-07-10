import type { Review } from '#/app/api/reviews/review'
import { ProductReviewCard } from '#/ui/product-review-card'

export async function Reviews({ data }: { data: Promise<Response> }) {
  const reviews = (await data.then((res) => res.json())) as Review[]

  return (
    <div className="space-y-6">
      <div className="text-lg font-medium text-white">Customer Reviews</div>
      <div className="space-y-8">
        {reviews.map((review) => {
          return <ProductReviewCard key={review.id} review={review} />
        })}
      </div>
    </div>
  )
}

const shimmer = `relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent`

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-2/6 rounded-lg bg-gray-900" />
      <div className="h-4 w-1/6 rounded-lg bg-gray-900" />
      <div className="h-4 w-full rounded-lg bg-gray-900" />
      <div className="h-4 w-4/6 rounded-lg bg-gray-900" />
    </div>
  )
}

export function ReviewsSkeleton() {
  return (
    <div className="space-y-6">
      <div className={`h-7 w-2/5 rounded-lg bg-gray-900 ${shimmer}`} />

      <div className="space-y-8">
        <Skeleton />
        <Skeleton />
      </div>
    </div>
  )
}
