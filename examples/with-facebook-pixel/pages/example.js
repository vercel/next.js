import * as fbq from '../lib/fpixel'

export default function Example() {
  const handleClick = () => {
    fbq.event('Purchase', { currency: 'USD', value: 10 })
  }

  return (
    <h1>
      Example: How use purchase event in pixel
      <button type="button" onClick={handleClick}>
        Buy $10
      </button>
    </h1>
  )
}
