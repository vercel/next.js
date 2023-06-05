'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { useCartCount } from './cart-count-context'

export function AddToCart({ initialCartCount }: { initialCartCount: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [, setOptimisticCartCount] = useCartCount()

  const addToCart = () => {
    setOptimisticCartCount(initialCartCount + 1)

    // update the cart count cookie
    document.cookie = `_cart_count=${initialCartCount + 1}; path=/; max-age=${
      60 * 60 * 24 * 30
    }};`

    // Normally you would also send a request to the server to add the item
    // to the current users cart
    // await fetch(`https://api.acme.com/...`);

    // Use a transition and isPending to create inline loading UI
    startTransition(() => {
      setOptimisticCartCount(null)

      // Refresh the current route and fetch new data from the server without
      // losing client-side browser or React state.
      router.refresh()

      // We're working on more fine-grained data mutation and revalidation:
      // https://beta.nextjs.org/docs/data-fetching/mutating
    })
  }

  return (
    <button
      className="relative w-full items-center space-x-2 rounded-lg bg-vercel-blue px-3 py-1  text-sm font-medium text-white hover:bg-vercel-blue/90 disabled:text-white/70"
      onClick={addToCart}
      disabled={isPending}
    >
      Add to Cart
      {isPending ? (
        <div className="absolute right-2 top-1.5" role="status">
          <div
            className="
          h-4 w-4 animate-spin rounded-full border-[3px] border-white border-r-transparent"
          />
          <span className="sr-only">Loading...</span>
        </div>
      ) : null}
    </button>
  )
}
