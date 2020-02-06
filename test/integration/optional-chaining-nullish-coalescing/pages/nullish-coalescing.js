let hello
let another = ''

export default () => (
  <>
    <p>result1: {hello ?? 'fallback'}</p>
    <p>result2: {another ?? 'fallback'}</p>
  </>
)
