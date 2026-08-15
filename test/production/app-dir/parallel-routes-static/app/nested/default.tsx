import { notFound } from 'next/navigation'

// The layout intentionally does not render children for /nested/foo or
// /nested/bar. An explicit not-found default keeps that choice valid under
// strict matching without changing the rendered named slots.
export default function Default() {
  notFound()
}
