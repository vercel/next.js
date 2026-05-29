function throwClientError() {
  throw new Error('Client error in pages router')
}

function callClientError() {
  throwClientError()
}

export default function PagesClientError() {
  return (
    <div>
      <button
        id="error-button"
        onClick={() => {
          callClientError()
        }}
      ></button>
    </div>
  )
}
