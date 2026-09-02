export default function Page({ slug, tab }) {
  return (
    <>
      <p id="pages-page">hello from pages/blog/[slug] ({slug})</p>
      <p id="tab">{tab}</p>
    </>
  )
}

export function getServerSideProps({ params, query }) {
  return {
    props: {
      slug: params.slug,
      tab: query.tab || 'a',
    },
  }
}
