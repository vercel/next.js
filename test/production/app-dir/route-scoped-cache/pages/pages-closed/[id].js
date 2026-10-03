import { state, State } from '../../lib/state'
export default function Page(props) {
  return <State value={props} />
}
export function getStaticPaths() {
  return {
    paths: ['en', 'fr'].flatMap((locale) =>
      ['known', 'not-found'].map((id) => ({ params: { id }, locale }))
    ),
    fallback: false,
  }
}
export function getStaticProps({ params, locale }) {
  if (params.id === 'not-found') return { notFound: true }
  return { props: state('pages-closed', params, locale), revalidate: 3600 }
}
