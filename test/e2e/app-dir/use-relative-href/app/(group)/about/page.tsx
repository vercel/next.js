import { RelativeHrefs } from '../../relative-hrefs'

export default function AboutPage() {
  return (
    <>
      <div id="about-page">About</div>
      <RelativeHrefs id="about-page-hrefs" targets={['/']} />
    </>
  )
}
