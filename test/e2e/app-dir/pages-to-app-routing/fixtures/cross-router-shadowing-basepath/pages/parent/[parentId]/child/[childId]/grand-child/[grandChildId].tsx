import { useRouter } from 'next/router'

export default function GrandChildPage() {
  const router = useRouter()
  const { parentId, childId, grandChildId } = router.query

  return (
    <>
      <h1 id="page-title">
        Pages GrandChild: {parentId}/{childId}/{grandChildId}
      </h1>
      <button
        id="to-child-btn"
        onClick={() => router.push(`/parent/${parentId}/child/${childId}`)}
      >
        To Child
      </button>
    </>
  )
}
