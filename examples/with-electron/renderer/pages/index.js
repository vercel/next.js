import { useState, useEffect } from 'react'

const Home = () => {
  const [input, setInput] = useState('')
  const [message, setMessage] = useState(null)

  useEffect(() => {
    const handleMessage = (event, message) => setMessage(message)
    global.ipcRenderer.on('message', handleMessage)

    return () => {
      global.ipcRenderer.removeListener('message', handleMessage)
    }
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    global.ipcRenderer.send('message', input)
    setMessage(null)
  }

  return (
    <div>
      <h1>Hello Electron!</h1>

      {message && <p>{message}</p>}

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </form>

      <style jsx>{`
        h1 {
          color: red;
          font-size: 50px;
        }
      `}</style>
    </div>
  )
}

export default Home
