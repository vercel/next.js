import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <>
      <p>
        This page is used to test that prefetch="auto" uses the default
        prefetching strategy (the same as if no prefetch prop is given).
      </p>

      <LinkAccordion
        // @ts-expect-error: "auto" not yet part of public types
        prefetch="auto"
        href="/dynamic"
      >
        Dynamic page with loading boundary
      </LinkAccordion>
    </>
  )
}
