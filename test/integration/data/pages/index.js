import getUptime from '../data/get-uptime'

export default function Index () {
  const uptime = getUptime()
  return <h1>The uptime of the server is {uptime}</h1>
}
