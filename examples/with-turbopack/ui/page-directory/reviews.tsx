import { type IReview } from '#/lib/page-directory/get-products'
import { ProductReviewCard as ProductReviewCardCss } from '#/ui/product-review-card'
// import { ProductReviewCard as ReviewCssModules } from '#/ui/modules/ProductReviewCard';

export function Reviews({ reviews }: { reviews: IReview[] }) {
  return (
    <div className="space-y-7">
      <h3 className="text-2xl font-medium text-white">Customer Reviews</h3>
      <div className="space-y-8">
        {reviews.map((review) => {
          return (
            <div key={review.id}>
              <ProductReviewCardCss review={review} />
              {/* Styled using in-built CSS Modules */}
              {/* <ReviewCssModules review={review} /> */}
            </div>
          )
        })}
      </div>
    </div>
  )
}
