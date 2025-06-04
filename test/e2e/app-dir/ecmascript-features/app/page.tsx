class Disposer {
  [Symbol.dispose]() {
    console.log('Disposed')
  }
}

export default function Page() {
  using _disposer = new Disposer()

  return <p>hello world</p>
}
