import { LinkAccordion } from '../../../components/link-accordion'

export default function Page() {
  return (
    <ul>
      {['direct', 'public-child', 'private-child'].map((route) => (
        <li key={route}>
          <LinkAccordion
            href={`/private-cached-root-params/en/${route}`}
            prefetch
          />
          <LinkAccordion
            href={`/private-cached-root-params/de/${route}`}
            prefetch
          />
        </li>
      ))}
    </ul>
  )
}
