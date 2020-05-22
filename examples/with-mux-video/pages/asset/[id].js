import { useEffect } from 'react'
import Router, { useRouter } from 'next/router'
import useSwr from 'swr'
import Spinner from '../../components/spinner'
import ErrorMessage from '../../components/error-message'
import UploadPage from '../../components/upload-page'

const fetcher = (url) => {
  return fetch(url).then((res) => res.json())
}


export default function Asset() {
  const router = useRouter()

  const { data, error } = useSwr(
    () => (router.query.id ? `/api/asset/${router.query.id}` : null),
    fetcher,
    { refreshInterval: 5000 }
  )

  const asset = data && data.asset

  useEffect(() => {
    if (asset && asset.playback_id && asset.status === 'ready') {
      Router.push(`/v/${asset.playback_id}`)
    }
  }, [asset])

  if (error) return <ErrorMessage message="Error fetching api" />
  if (data && data.error) return <ErrorMessage message={data.error} />


  return (
    <UploadPage>
      <div>Preparing...</div>
      <Spinner />
    </UploadPage>
  )
}
