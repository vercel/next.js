class TestClass {
  static currentDate = new Date()
}

export default function Page() {
  return (
    <div>
      <p>Hello world</p>
      <span>{TestClass.currentDate.toString()}</span>
    </div>
  )
}
