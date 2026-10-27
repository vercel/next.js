// `/parallel-scroll/nav` only has a page in @modal. Declare what a direct
// request should render for children instead of relying on the legacy
// synthesized not-found fallback that soft navigation happened to hide.
export default function Default() {
  return null
}
