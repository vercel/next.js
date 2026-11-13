import { state, State } from '../../lib/state'
export default function Page(props) {
  return <State value={props} />
}
export function getStaticPaths() {
  return {
    paths: ['en', 'fr'].flatMap((locale) =>
      ['known', 'seed-cold', 'seed-warm'].map((id) => ({
        params: { id },
        locale,
      }))
    ),
    fallback: 'blocking',
  }
}
export function getStaticProps({ params, locale }) {
  if (params.id.startsWith('missing-'))
    return { notFound: true, revalidate: 3600 }
  if (params.id === 'redirect')
    return {
      redirect: { destination: '/pages-victim/known', permanent: false },
    }
  return {
    props: state('pages-victim', params, locale),
    revalidate: params.id.startsWith('fast-') ? 1 : 3600,
  }
}
