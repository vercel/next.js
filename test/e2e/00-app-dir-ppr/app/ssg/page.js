export const revalidate = 3

export default function Page() {
  return (
    <>
      <p>hello from /ssg</p>
      <p>{Date.now()}</p>
    </>
  )
}
