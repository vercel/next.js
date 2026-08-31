import { LinkAccordion, RetainedCounter } from '../../page.client'

export default function Page() {
  return (
    <div>
      <p>Named content slot</p>
      <RetainedCounter />
      <LinkAccordion href="/named-target" />
      <LinkAccordion href="/named-host/named-catchall-target/photo" />
    </div>
  )
}
