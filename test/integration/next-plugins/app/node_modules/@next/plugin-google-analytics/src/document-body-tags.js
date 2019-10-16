export default async function bodyTags () {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: 'console.log("hi") ' }} />
    </>
  )
}
