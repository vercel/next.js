await Promise.resolve('tadaa')

export default function Config() {
  const date = new Date()
  return (
    <div>
      <p>Config page loaded at: {date.toJSON()}</p>
    </div>
  )
}
