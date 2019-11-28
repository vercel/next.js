export async function unstable_getStaticPaths() {
  return ['/hello', '/world']
}

export default () => <p>something is missing 🤔</p>
