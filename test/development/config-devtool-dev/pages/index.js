import { useEffect } from 'react'

export default function Index(props) {
  useEffect(() => {
    throw new Error('this should render')
  }, [])
  return <div>Index Page</div>
}
