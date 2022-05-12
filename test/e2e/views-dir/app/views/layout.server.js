export async function getServerSideProps() {
  return {
    props: {
      world: 'world',
    },
  }
}

export default function Root({ headChildren, bodyChildren, world }) {
  return (
    <html className="this-is-the-document-html">
      <head>
        {headChildren}
        <title>{`hello ${world}`}</title>
      </head>
      <body className="this-is-the-document-body">{bodyChildren}</body>
    </html>
  )
}
