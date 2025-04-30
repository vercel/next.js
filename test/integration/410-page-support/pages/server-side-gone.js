export async function getServerSideProps() {
  return {
    gone: true,
  }
}

export default function GonePage() {
  return <h1>This should not be rendered</h1>
}
