import { LinkAccordion } from '../../../components/link-accordion'

export default function RuntimePrefetchMetadataIndexPage() {
  return (
    <div id="runtime-prefetch-metadata-index">
      <h1>Runtime Prefetch - Metadata Param Access</h1>
      <ul>
        <li>
          <LinkAccordion href="/runtime-prefetch-metadata/aaa" prefetch>
            Slug: aaa
          </LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/runtime-prefetch-metadata/bbb" prefetch>
            Slug: bbb
          </LinkAccordion>
        </li>
      </ul>
    </div>
  )
}
