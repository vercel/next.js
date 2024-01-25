class TestClass {
  static text = 'hello world'
}

export default function Page() {
  return (
    <div>
      <p>{TestClass.text}</p>
    </div>
  )
}
