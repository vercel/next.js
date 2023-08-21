export default function FeedLayout({ params, feed, modal }) {
  return (
    <>
      <h1>User: {params.username}</h1>
      {feed}
      {modal}
    </>
  )
}
