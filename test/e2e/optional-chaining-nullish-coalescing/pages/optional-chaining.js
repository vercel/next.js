let hello
let another = { thing: 1 }

export default () => (
  <>
    <p>result1: {hello?.world ? 'something' : 'nothing'}</p>
    <p>result2: {another?.thing ? 'something' : 'nothing'}</p>
  </>
)
