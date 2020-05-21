export default function Counter({ counter = {} }) {
  return (
    <div>
      <h1>
        Count: <span>{counter.count}</span>
      </h1>
      <button onClick={() => counter.decrement()}>-1</button>
      <button onClick={() => counter.increment()}>+1</button>
      <button onClick={() => counter.reset()}>Reset</button>
    </div>
  )
}
