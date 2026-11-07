export default function Page() {
  return <p>hello world</p>
}

// Render on every request, so the server traces the render.
export function getServerSideProps() {
  return { props: {} }
}
