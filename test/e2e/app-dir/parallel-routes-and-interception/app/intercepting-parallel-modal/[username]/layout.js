export default function FeedLayout({ params, children, modal }) {
  return (
    <>
      <h1>User: {params.username}</h1>
      {children}
      {modal}
    </>
  )
}
