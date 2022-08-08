export function getServerSideProps({ params }) {
  return { props: { params } }
}

export default function Page({ params }) {
  return (
    <h1 id="text" data-params={params.slug.join('/') ?? ''}>
      hello from /catch-all/{params.slug.join('/')}
    </h1>
  )
}
