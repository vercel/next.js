export default function TestPage({ slug, time }) {
  return (
    <>
      Slug: <div id="slug">{slug}</div>
      <br />
      Time: <div id="time">{time}</div>
    </>
  )
}

export function getStaticProps({ params }) {
  return {
    props: {
      slug: params.slug,
      time: new Date().getTime(),
    },
    revalidate: true,
  }
}

export function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
