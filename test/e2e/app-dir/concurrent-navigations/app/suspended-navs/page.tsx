import { Suspense } from 'react'
import { ClientRefreshButton } from './client'
import { redirect } from 'next/navigation'
import { DynamicRenderCounter } from '../../components/dynamic-render-counter'
import { LinkAccordion } from '../../components/link-accordion'

function NavigateButton({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <form
      action={async () => {
        'use server'
        redirect(href)
      }}
    >
      <button data-navigate-button={href} type="submit">
        {children}
      </button>
    </form>
  )
}

export default function Page() {
  return (
    <div>
      <p>Tests scenarios related to unknown navigations.</p>
      <p>
        The most common case is a redirect from a Server Action. Server Actions
        suspend the router because we don't know the target route until the
        action runs. Or whether the action will redirect at all. However, if a
        new navigation is triggered while the router is suspended, that one is
        not blocked.
      </p>
      <p>This buttons triggers a redirect from a Server Action:</p>
      <ul id="action-links">
        <li>
          <NavigateButton href="/suspended-navs/target-page">
            /suspended-navs/target-page
          </NavigateButton>
        </li>
      </ul>
      <p>
        This is a regular link. It will not suspend the router (assuming it's
        prefetched in time):
      </p>
      <ul id="regular-links">
        <li>
          <LinkAccordion href="/suspended-navs/target-page" />
        </li>
      </ul>
      <ClientRefreshButton />
      <Suspense fallback="Loading...">
        <p id="suspended-navs-page-render-counter">
          Page renders: <DynamicRenderCounter />
        </p>
      </Suspense>
    </div>
  )
}
