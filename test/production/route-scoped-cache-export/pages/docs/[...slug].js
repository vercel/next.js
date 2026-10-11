export default function Page({ slug }) {
  return <p id="state">{`docs:${slug.join('/')}`}</p>
}
export function getStaticPaths() {
  return { paths: [{ params: { slug: ['guide', 'intro'] } }], fallback: false }
}
export function getStaticProps({ params }) {
  return { props: params }
}
