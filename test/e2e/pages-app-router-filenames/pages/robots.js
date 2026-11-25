export function getServerSideProps() {
  return { props: { name: 'robots' } }
}

export default function Robots({ name }) {
  return <p id="page">{name}</p>
}
