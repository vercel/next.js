import Drawer from './drawer'

export default function Page() {
  // Revalidation must refresh server data, not depend on a client re-render.
  return <Drawer now={Date.now()} />
}
