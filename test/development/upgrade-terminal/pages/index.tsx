export function getServerSideProps() {
  console.log('REQUEST_LOG')
  return { props: { pid: process.pid } }
}

export default function Page({ pid }: { pid: number }) {
  return <p data-pid={pid}>hello world</p>
}
