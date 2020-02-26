export async function unstable_getStaticPaths() {
  return { paths: ['/hello', '/world'], fallback: true }
}

export default () => <p>something is missing 🤔</p>
