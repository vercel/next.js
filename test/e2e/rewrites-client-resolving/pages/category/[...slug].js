import { useRouter } from 'next/router'

export default () => (
  <p id="category">category: {useRouter().query.slug?.join('/')}</p>
)
