// Server-rendered Pages Router page — `getServerSideProps` forces a `.js`
// server entry, exercises the `pages` route type.
export default function ServerPage() {
  return <p>pages-ssr</p>
}

export async function getServerSideProps() {
  return { props: {} }
}
