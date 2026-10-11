import { state, State } from '../../lib/state'

export default function Page(props) {
  return <State value={props} />
}

export function getStaticPaths() {
  return {
    paths: ['en', 'fr'].flatMap((locale) =>
      ['allowed', 'not-found'].map((slug) => ({
        params: { slug: [slug] },
        locale,
      }))
    ),
    fallback: false,
  }
}

export function getStaticProps({ params, locale }) {
  if (params.slug[0] === 'not-found') return { notFound: true }
  return { props: state('pages-closed-catchall', params, locale) }
}
