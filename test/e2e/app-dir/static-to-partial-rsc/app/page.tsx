import { LinkAccordion } from './link-accordion'

export default function Page() {
  return (
    <main>
      <LinkAccordion href="/static-to-partial-rsc/navigation" prefetch={false}>
        Navigate
      </LinkAccordion>
      <LinkAccordion
        href="/static-to-partial-rsc/runtime-prefetch"
        prefetch={true}
      >
        Prefetch
      </LinkAccordion>
      <LinkAccordion href="/static-to-partial-rsc/runtime-shell">
        Load shell
      </LinkAccordion>
    </main>
  )
}
