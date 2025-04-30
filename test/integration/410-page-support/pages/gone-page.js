export default function GonePage() {
  return <h1>This is a page that triggers the 410 status code</h1>
}

export function getServerSideProps() {
  return {
    props: {},
    gone: true,
  }
}
