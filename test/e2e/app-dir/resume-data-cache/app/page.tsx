import Link from 'next/link'
import React from 'react'
import { LinkAccordion } from '../components/link-accordion'
import { revalidateTag } from 'next/cache'

export default function Page() {
  const links = (href: string) => {
    return (
      <ul>
        <li>
          <a href={href}>{href} (MPA nav)</a>
        </li>
        <li>
          <Link href={href} prefetch={false}>
            {href} (unprefetched client nav)
          </Link>
        </li>
        <li>
          <LinkAccordion href={href} prefetch="auto">
            {href} (prefetched client nav)
          </LinkAccordion>
        </li>
      </ul>
    )
  }
  return (
    <main>
      {(['use-cache', 'fetch-cache'] as const).map((cacheKind) => (
        <React.Fragment key={cacheKind}>
          <h2>cache kind - {cacheKind}</h2>

          <section>
            <h3>initial</h3>
            {links(`/${cacheKind}/initial`)}
          </section>

          <section>
            <h3>revalidation</h3>
            {(['single', 'concurrent'] as const).map((concurrency) => {
              const concurrentVariants = {
                single: ['html', 'rsc', 'segment'],
                concurrent: ['html', 'rsc', 'segment', 'all'],
              } as const
              return (
                <React.Fragment key={concurrency}>
                  <h4>concurrency - {concurrency}</h4>
                  <ul>
                    {concurrentVariants[concurrency].map((id) => {
                      const path = `/${cacheKind}/revalidation/${concurrency}/${id}`
                      const cacheTag = `test-${cacheKind}-revalidation-${concurrency}.${id}`
                      return (
                        <React.Fragment key={id}>
                          <li>
                            <div
                              style={{
                                display: 'flex',
                                gap: '1ch',
                                alignItems: 'baseline',
                              }}
                            >
                              <span>{id} </span>
                              <form
                                action={async () => {
                                  'use server'
                                  // Mirror /revalidate
                                  revalidateTag(cacheTag, 'minutes')
                                }}
                              >
                                <button type="submit">Revalidate</button>
                              </form>
                            </div>
                            {links(path)}
                          </li>
                        </React.Fragment>
                      )
                    })}
                  </ul>
                </React.Fragment>
              )
            })}
            <ul></ul>
          </section>
        </React.Fragment>
      ))}
    </main>
  )
}
