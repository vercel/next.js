import { SkeletonCard } from '@/ui/SkeletonCard';
import { Suspense } from 'react';
import Description from './description';
import ProductHeader from './product-header';
import BuyNow from './buy-now';

export default function Posts() {
  return (
    <section>
      <div className="text-white">
        <div className="space-y-4">
          <div className="flex space-x-6">
            <div className="w-full space-y-4">
              <Suspense
                fallback={
                  <div className="w-full h-40 ">
                    <SkeletonCard isLoading={true} />
                  </div>
                }
              >
                <ProductHeader />
              </Suspense>
              <Suspense
                fallback={
                  <div className="w-full h-40 ">
                    <SkeletonCard isLoading={true} />
                  </div>
                }
              >
                <Description />
              </Suspense>
            </div>
            <div className="min-w-[250px]">
              <Suspense
                fallback={
                  <div className="w-full h-40 ">
                    <SkeletonCard isLoading={true} />
                  </div>
                }
              >
                <BuyNow />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
