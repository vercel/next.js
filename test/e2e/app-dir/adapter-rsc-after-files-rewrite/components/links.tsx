import { LinkAccordion } from './link-accordion'

export function Links() {
  return (
    <ul>
      <li>
        <LinkAccordion href="/" />
      </li>
      <li>
        <LinkAccordion href="/dynamic-page" />
      </li>
      <li>
        <LinkAccordion href="/static-page" />
      </li>
      <li>
        {/*
          Not prefetched: on Vercel's non-adapter builder a segment prefetch
          for a path that only a user rewrite serves fails (a separate,
          pre-existing issue). The navigation itself is what this suite
          covers.
        */}
        <LinkAccordion href="/unknown" prefetch={false} />
      </li>
    </ul>
  )
}
