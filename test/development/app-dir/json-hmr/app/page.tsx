import config from '../data/config.json'

export default function Page() {
  return (
    <div>
      <p id="server-value">{config.value}</p>
    </div>
  )
}
