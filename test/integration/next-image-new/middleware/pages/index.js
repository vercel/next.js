import Image from 'next/image'

export default function Page() {
  return (
    <>
      <h1>Its Works</h1>
      <Image
        alt="empty"
        src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        width={400}
        height={400}
      />
    </>
  )
}
