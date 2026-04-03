export default function Page() {
  return (
    <div>
      <h2>Slot With Optional Catchall Page</h2>
      <p>
        The @breadcrumbs slot uses [[...catchall]] which matches all routes
        including the root. No default.tsx should be required.
      </p>
    </div>
  )
}
