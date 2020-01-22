import { useRouter } from 'next/router'
import Header from '../../components/header'

const Comment = () => {
  const router = useRouter()
  const { slug = [] } = router.query
  const [year, ...postSlug] = slug

  return (
    <>
      <Header />
      <h1>Year: {year}</h1>
      <h1>Slug: {postSlug.join('/')}</h1>
    </>
  )
}

export default Comment
