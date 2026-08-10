export async function getStaticPaths() {
  return { paths: ['/hello', '/world'], fallback: true }
}

export default () => <p>something is missing 🤔</p>
