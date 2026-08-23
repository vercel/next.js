export function getStaticProps() {
  return { props: { name: 'sitemap' } }
}

export default function Sitemap({ name }) {
  return <p id="page">{name}</p>
}
