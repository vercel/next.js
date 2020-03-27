import useSwr from 'swr'
import { withRouter } from 'next/router'

const fetcher = async url => {
  const response = await fetch(url)
  return await response.json()
}

const User = ({ router }) => {
  const { data, error } = useSwr(`/api/user/${router.query.id}`, fetcher)

  if (error) return <div>Failed to load users</div>
  if (!data) return <div>Loading...</div>

  return <div>{data.name}</div>
}

export default withRouter(User)
