export default function Page() {
  return (
    <p>
      This page would be static except that there's an interceptor at the same
      segment, making it dynamic. This is a build error because there's no
      Suspense boundary (i.e. loading.tsx) defined. When using an interceptor at
      the root, it should not block serving the static shell.
    </p>
  )
}
