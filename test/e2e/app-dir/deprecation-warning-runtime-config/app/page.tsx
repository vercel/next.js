import getConfig from 'next/config'

export default function Page() {
  getConfig()
  return <p>hello world</p>
}
