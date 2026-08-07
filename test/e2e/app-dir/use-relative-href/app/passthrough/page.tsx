import { RelativeHrefs } from '../relative-hrefs'

export default function PassthroughPage() {
  return (
    <div>
      <p id="passthrough-page">Passthrough</p>
      <RelativeHrefs
        id="passthrough-page-hrefs"
        targets={[
          'https://example.com/docs',
          'https://example.com/docs?tab=1#top',
          '//example.com/cdn',
          'mailto:hi@example.com',
          '#faq',
          '?tab=files',
          'relative/path',
        ]}
      />
    </div>
  )
}
