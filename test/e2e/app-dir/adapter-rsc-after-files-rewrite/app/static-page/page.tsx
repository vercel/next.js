import { Links } from '../../components/links'

// A fixed path that is prerendered, so its RSC output is served directly.
export default function Page() {
  return (
    <>
      <h1 id="page">Prerendered page</h1>
      <p id="content">Prerendered content</p>
      <Links />
    </>
  )
}
