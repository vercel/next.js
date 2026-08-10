import type { ComponentProps } from 'react'

export function CacheDisabledBody(props: ComponentProps<'div'>) {
  return (
    <article className="dev-tools-info-article" {...props}>
      <p className="dev-tools-info-paragraph">
        While loading this page, all caches were bypassed.
      </p>
      <p className="dev-tools-info-paragraph">
        This is the case when the cache was disabled in the browser's devtools,
        the page was hard-reloaded, or draft mode is enabled.
      </p>
      <p className="dev-tools-info-paragraph">
        As a result, the loading experience might not be the same as in
        production. React's DevTools will also not accurately show information
        about what would normally suspend in the page, and Next.js cannot
        validate whether a navigation to this page would be instant or blocking.
      </p>
    </article>
  )
}
