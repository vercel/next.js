// `%5F` becomes an underscore in the route, so this page is at the pathname
// that routing reserves for a rejected request. A plain double underscore would
// make the folder private instead.
export default function Page() {
  return <p id="page">page</p>
}
