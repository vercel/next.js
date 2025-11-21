import { useEffect, useState } from 'react'
export default function Page() {
  const [path, setPath] = useState(null)
  useEffect(() => {
    setPath(process.env.NEXT_PUBLIC_TEST_DEST)
  }, [])
  return path ? <p id="global-value">{path}</p> : <p>Waiting </p>
}
