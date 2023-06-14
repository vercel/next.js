import { NextLogo } from '#/ui/next-logo'
import { SearchIcon, ShoppingCartIcon } from '@heroicons/react/solid'
import Image from 'next/image'
import Link from 'next/link'
import { CartCount } from './cart-count'

export function Header() {
  return (
    <div className="flex items-center justify-between gap-x-3 rounded-lg bg-gray-800 px-3 py-3 lg:px-5 lg:py-4">
      <div className="flex gap-x-3">
        <Link href="/streaming">
          <div className="h-10 w-10 hover:opacity-70">
            <NextLogo />
          </div>
        </Link>

        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <SearchIcon className="h-5 w-5 text-gray-300" />
          </div>
          <input
            aria-label="Search"
            type="search"
            name="search"
            id="search"
            className="block w-full rounded-full border-none bg-gray-600 pl-10 font-medium text-gray-200 focus:border-vercel-pink focus:ring-2 focus:ring-vercel-pink"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex shrink-0 gap-x-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-600 text-white">
          <ShoppingCartIcon className="w-6 text-white" />
          <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-vercel-cyan text-sm font-bold text-cyan-800">
            <CartCount />
          </div>
        </div>

        <Image
          src="/prince-akachi-LWkFHEGpleE-unsplash.jpg"
          className="rounded-full"
          width={40}
          height={40}
          alt="User"
        />
      </div>
    </div>
  )
}
