const Test5 = () => (
  <>
    <h1>Client Test 5</h1>
    <button
      onClick={() => {
        throw new Error('Client Test 5')
      }}
    >
      Click me to throw an Error
    </button>
  </>
)

export default Test5
