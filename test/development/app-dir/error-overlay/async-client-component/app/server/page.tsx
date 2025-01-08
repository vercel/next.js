const appValue = await Promise.resolve('hello')

export default function Page() {
  return <p id="app-router-value">{appValue}</p>
}
