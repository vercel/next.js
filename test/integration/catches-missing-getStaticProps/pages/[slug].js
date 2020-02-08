export async function unstable_getStaticPaths() {
  return { paths: ['/hello', '/world'] }
}

export default () => <p>something is missing 🤔</p>
