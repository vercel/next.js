export default function PagesClientLog() {
  return (
    <div>
      <button
        id="log-button"
        onClick={() => {
          console.log('Log from pages router client component')
        }}
      >
        Log Message
      </button>
      <button
        id="error-button"
        onClick={() => {
          console.error('Error from pages router')
        }}
      >
        Log Error
      </button>
    </div>
  )
}
