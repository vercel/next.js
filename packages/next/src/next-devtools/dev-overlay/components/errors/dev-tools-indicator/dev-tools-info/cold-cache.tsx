import type { ComponentProps } from 'react'

export function ColdCacheBody(props: ComponentProps<'div'>) {
  return (
    <article className="dev-tools-info-article" {...props}>
      <p className="dev-tools-info-paragraph">
        While loading this page, one or more caches were empty and had to be
        filled while the response was streaming.
      </p>
      <p className="dev-tools-info-paragraph">
        This happens on the first render after a cache is cleared, for example
        after a server restart, a revalidation, or an entry expiring, i.e. the
        request that fills the cache.
      </p>
      <p className="dev-tools-info-paragraph">
        As a result, this load isn't representative of production: cached
        content streamed in as it was computed instead of being served
        instantly, and React's DevTools won't accurately show what would
        normally suspend in the page. Reload the page, now that the caches are
        warm, to see the production-like loading sequence.
      </p>
    </article>
  )
}
