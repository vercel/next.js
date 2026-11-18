import { LinkAccordion } from './fallback-hydration/client'

export default function Page() {
  return (
    <>
      <p>Fallback hydration hub</p>
      <LinkAccordion href="/fallback-hydration/en/products/return" />
      <LinkAccordion
        href="/fallback-hydration/en/products/private-navigation?value=private-navigation-query#private-navigation-fragment"
        prefetch={false}
      />
    </>
  )
}
