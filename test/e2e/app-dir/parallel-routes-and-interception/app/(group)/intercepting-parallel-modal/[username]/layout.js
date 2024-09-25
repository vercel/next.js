export default async function FeedLayout({ params, feed, modal }) {
  return (
    <>
      <h1>User: {(await params).username}</h1>
      {feed}
      {modal}
    </>
  )
}
