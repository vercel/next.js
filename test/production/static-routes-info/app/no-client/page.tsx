// Third app-page that deliberately does NOT import the `Counter` client
// component. Used as the negative reference in the "client components
// contribute per-route client JS" assertion: routes that import Counter
// must ship strictly more client JS bytes than this route.
export default function NoClient() {
  return <p>no-client</p>
}
