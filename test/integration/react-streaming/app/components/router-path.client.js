import { useRouter } from 'next/router'

export default () => {
  const { pathname } = useRouter()
  return <div>{`router pathname: ${pathname}`}</div>
}
