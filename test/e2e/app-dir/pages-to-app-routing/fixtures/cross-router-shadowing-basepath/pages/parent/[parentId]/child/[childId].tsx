import { useRouter } from 'next/router'

export default function ChildPage() {
  const router = useRouter()
  const { parentId, childId } = router.query

  return (
    <>
      <h1 id="page-title">
        Pages Child: {parentId}/{childId}
      </h1>
      <button
        id="to-grandchild-btn"
        onClick={() =>
          router.push(`/parent/${parentId}/child/${childId}/grand-child/99`)
        }
      >
        To Grandchild
      </button>
      <button
        id="to-app-parent-btn"
        onClick={() => router.push(`/parent/${parentId}`)}
      >
        To App Parent
      </button>
    </>
  )
}
