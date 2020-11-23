import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'

import Container from '@/components/container'
import Nav from '@/components/nav'

export default function EditEntryPage() {
  const [entry, setEntry] = useState(null)
  const router = useRouter()
  const { id } = router.query

  useEffect(() => {
    if (id) {
      getEntry()
    }
  }, [getEntry, id])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function getEntry() {
    const res = await fetch(`/api/get-entry?id=${id}`)
    const json = await res.json()
    if (!res.ok) throw Error(json.message)
    setEntry(json)
  }

  if (entry) {
    return (
      <>
        <Nav title="View" />
        <Container>
          <h1 className="font-bold text-3xl my-2">{entry.title}</h1>
          <p>{entry.content}</p>
        </Container>
      </>
    )
  } else {
    return (
      <>
        <Nav title="View" />
        <Container>
          <h1 className="font-bold text-3xl my-2">...</h1>
          <p>...</p>
        </Container>
      </>
    )
  }
}
