import { LinkAccordion } from '../components/link-accordion'

export default async function Page() {
  return (
    <main>
      <h2>Conditional cookies in the shell of a static page</h2>
      <ul>
        <li>
          <LinkAccordion href="/static-conditional-cookies-in-shell/static-shell-equal-to-prefetch">
            /static-conditional-cookies-in-shell/static-shell-equal-to-prefetch
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/static-conditional-cookies-in-shell/static-shell-smaller-than-prefetch">
            /static-conditional-cookies-in-shell/static-shell-smaller-than-prefetch
          </LinkAccordion>
        </li>
      </ul>

      <h2>Conditional cookies in the shell of a partial page</h2>
      <ul>
        <li>
          <LinkAccordion href="/partial-conditional-cookies-in-shell/static-shell-equal-to-prefetch">
            /partial-conditional-cookies-in-shell/static-shell-equal-to-prefetch
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/partial-conditional-cookies-in-shell/static-shell-smaller-than-prefetch">
            /partial-conditional-cookies-in-shell/static-shell-smaller-than-prefetch
          </LinkAccordion>
        </li>
      </ul>

      <h2>Conditional cookies in the prefetch of a partial page</h2>
      <ul>
        <li data-prefetch="auto">
          <LinkAccordion href="/partial-conditional-cookies-in-prefetch">
            /partial-conditional-cookies-in-prefetch (auto prefetch)
          </LinkAccordion>
        </li>
        <li data-prefetch="true">
          <LinkAccordion
            href="/partial-conditional-cookies-in-prefetch"
            prefetch={true}
          >
            /partial-conditional-cookies-in-prefetch (prefetch=true)
          </LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
