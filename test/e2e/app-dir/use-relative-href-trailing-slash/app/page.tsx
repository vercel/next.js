import { RelativeHrefs } from './relative-hrefs'

export default function HomePage() {
  return (
    <>
      <div id="home-page">Home</div>
      <RelativeHrefs id="home-page-hrefs" targets={['/']} />
    </>
  )
}
