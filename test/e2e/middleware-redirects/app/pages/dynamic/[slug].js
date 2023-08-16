export default function Account({ slug }) {
  return (
    <p id="dynamic" className="title">
      Welcome to a /dynamic/[slug]: {slug}
    </p>
  )
}

export function getServerSideProps({ params }) {
  return {
    props: {
      slug: params.slug,
    },
  }
}
