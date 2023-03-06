export default function SlugPage({ slug }) {
  return <div id="content">Pages dir slug page: {slug}</div>
}

export const getStaticPaths = () => {
  return {
    paths: [
      { params: { slug: 'random' }, locale: 'en' },
      { params: { slug: 'anything' }, locale: 'id' },
      { params: { slug: 'modnar' }, locale: 'en' },
    ],
    fallback: false,
  }
}

export const getStaticProps = (ctx) => {
  return {
    props: {
      slug: ctx.params.slug,
    },
  }
}
