export default function GoneAndRedirect() {
  return <h1>This page should not be rendered</h1>
}

export function getServerSideProps() {
  return {
    redirect: {
      destination: '/',
      permanent: false,
    },
    gone: true,
  }
}
