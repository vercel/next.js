console.log('preload-test:page-evaluated')

export function getServerSideProps() {
  return { props: {} }
}

export default function Control() {
  return <p>control</p>
}
