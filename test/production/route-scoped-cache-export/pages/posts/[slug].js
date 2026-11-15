export default function Page({ slug }) {
  return <p id="state">{`pages:${slug}`}</p>
}
export function getStaticPaths() {
  return {
    paths: ['known', 'index', 'café', 'with space'].map((slug) => ({
      params: { slug },
    })),
    fallback: false,
  }
}
export function getStaticProps({ params }) {
  return { props: params }
}
