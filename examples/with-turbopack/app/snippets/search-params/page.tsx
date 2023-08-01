import { Boundary } from '#/ui/boundary'
import { ExternalLink } from '#/ui/external-link'
import { Suspense } from 'react'
import ActiveLink from './active-link'
import Client from './client'

const options = [
  {
    name: 'Sort',
    value: 'sort',
    items: ['asc', 'desc'],
  },
  {
    name: 'Page',
    value: 'page',
    items: ['1', '2', '3'],
  },
  {
    name: 'Items Per Page',
    value: 'perPage',
    items: ['10', '25', '100'],
  },
]

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: any }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <h1 className="text-lg font-bold">
        Updating <code>searchParams</code>
      </h1>
      <p>
        The <code>useSearchParams</code> hook returns a read only version of{' '}
        <code>URLSearchParams</code>. You can use{' '}
        <code>useRouter&#40;&#41;</code> or <code>&lt;Link&gt;</code> to set new{' '}
        <code>searchParams</code>. After a navigation is performed, the current{' '}
        <code>page.js</code> will receive an updated <code>searchParams</code>{' '}
        prop.
      </p>
      <div className="mt-12 space-y-12">
        <div className="space-y-4">
          <Boundary color="blue" labels={['From the Client']}>
            <h3 className="mt-0">
              Using <code>useRouter&#40;&#41;</code>
            </h3>

            <Suspense>
              <Client options={options} />
            </Suspense>
          </Boundary>

          <ExternalLink href="https://beta.nextjs.org/docs/api-reference/use-search-params">
            Docs
          </ExternalLink>
        </div>

        <div className="space-y-4">
          <Boundary labels={['From the Server']}>
            <h3 className="mt-0">
              Using <code>&lt;Link&gt;</code>
            </h3>

            <div className="flex items-center gap-6">
              {options.map((option) => {
                return (
                  <div key={option.name}>
                    <div className="text-gray-400">{option.name}</div>

                    <div className="mt-1 flex gap-2">
                      {option.items.map((item, i) => {
                        const isActive =
                          // set the first item as active if no search param is set
                          (!searchParams[option.value] && i === 0) ||
                          // otherwise check if the current item is the active one
                          item === searchParams[option.value]

                        // create new searchParams object for easier manipulation
                        const params = new URLSearchParams(searchParams)
                        params.set(option.value, item)
                        return (
                          <ActiveLink
                            key={item}
                            isActive={isActive}
                            searchParams={params.toString()}
                          >
                            {item}
                          </ActiveLink>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Boundary>

          <ExternalLink href="https://beta.nextjs.org/docs/api-reference/file-conventions/page">
            Docs
          </ExternalLink>
        </div>
      </div>
    </div>
  )
}
