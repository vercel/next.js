export function getStaticProps() {
  return { props: { name: 'page' } }
}

export default function Page({ name }) {
  return <p id="page">{name}</p>
}
