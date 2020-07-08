import { useState } from 'react'

export default function Counter() {
  const [counter, setCounter] = useState(1)

  return (
    <div>
      <div>Counter: {counter}</div>
      <div className="flex mt-1">
        <button
          className="bg-black hover:bg-white hover:text-black border border-black text-white py-2 px-5 transition-colors duration-200"
          onClick={() => setCounter((prev) => prev + 1)}
        >
          Increase
        </button>
        <button
          className="bg-black hover:bg-white hover:text-black border border-black text-white py-2 px-5 transition-colors duration-200 ml-2"
          onClick={() => setCounter((prev) => prev - 1)}
        >
          Decrease
        </button>
      </div>
    </div>
  )
}
