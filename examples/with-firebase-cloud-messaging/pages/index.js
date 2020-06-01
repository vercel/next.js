import { useEffect } from 'react'
import { firebaseCloudMessaging } from '../utils/webPush'

const Index = () => {
  useEffect(() => {
    firebaseCloudMessaging.init()
  }, [])

  return <div>Next.js with firebase cloud messaging.</div>
}

export default Index
