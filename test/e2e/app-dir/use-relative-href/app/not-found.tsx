import { RelativeHrefs } from './relative-hrefs'

export default function NotFound() {
  return (
    <>
      <div id="not-found-page">Not found</div>
      <RelativeHrefs id="not-found-hrefs" targets={['/', '/pricing']} />
    </>
  )
}
