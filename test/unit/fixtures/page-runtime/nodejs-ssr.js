export default function Nodejs() {
  return 'nodejs'
}

export function getServerSideProps() {
  return { props: {} }
}

export const config = {
  runtime: 'nodejs',
}
