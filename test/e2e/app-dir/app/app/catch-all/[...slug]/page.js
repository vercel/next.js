import Widget from './components/widget'
import NotAPage from './not-a-page'

export default function Page({ params }) {
  return (
    <>
      <h1 id="text" data-params={params.slug.join('/') ?? ''}>
        hello from /catch-all/{params.slug.join('/')}
      </h1>
      <Widget />
      <NotAPage />
    </>
  )
}
