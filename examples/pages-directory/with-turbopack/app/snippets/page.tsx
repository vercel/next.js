import { ExternalLink } from '#/ui/external-link'
import Link from 'next/link'

const items = [
  {
    name: 'Updating searchParams',
    slug: 'search-params',
    description: 'Update searchParams using `useRouter` and `<Link>`',
  },
]

export default function Page() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium text-gray-300">Code Snippets</h1>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {items.map((item) => {
          return (
            <Link
              href={`/snippets/${item.slug}`}
              key={item.name}
              className="group block space-y-1.5 rounded-lg bg-gray-900 px-5 py-3 hover:bg-gray-800"
            >
              <div className="font-medium text-gray-200 group-hover:text-gray-50">
                {item.name}
              </div>

              {item.description ? (
                <div className="text-sm text-gray-400 line-clamp-3 group-hover:text-gray-300">
                  {item.description}
                </div>
              ) : null}
            </Link>
          )
        })}
      </div>

      <div className="flex gap-2">
        <ExternalLink href="https://github.com/vercel/app-playground/tree/main/app/snippets">
          Code
        </ExternalLink>
      </div>
    </div>
  )
}
