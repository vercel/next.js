import { state, State } from '../../../lib/state'

export default function Page(props) {
  return <State value={props} />
}

export function getStaticPaths() {
  return {
    paths: ['en', 'fr'].flatMap((locale) =>
      ['published', 'not-found'].map((id) => ({ params: { id }, locale }))
    ),
    fallback: false,
  }
}

export function getStaticProps({ params, locale }) {
  if (params.id === 'not-found') return { notFound: true }
  return {
    props: state('pages-admission-sibling', params, locale),
    revalidate: false,
  }
}
