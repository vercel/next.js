export default () => (
  <div className='hello'>
    <p>
      Hello World! Here's a secret shared with the client using Next env: <strong>{process.env.SECRET}</strong>, the secret is shared
      at compile time, which means every reference to the secret is replaced
      with its value
    </p>
    <style jsx>{`
      .hello {
        font: 15px Helvetica, Arial, sans-serif;
        background: #eee;
        padding: 100px;
        text-align: center;
        transition: 100ms ease-in background;
      }
      .hello:hover {
        background: #ccc;
      }
    `}</style>
  </div>
)
