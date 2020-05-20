import getConfig from 'next/config'

const { publicRuntimeConfig } = getConfig()
const { API_URL } = publicRuntimeConfig

export default function Home() {
  return <div>The API_URL is {API_URL}</div>
}
