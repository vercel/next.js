export default function Page() {
  if (process.env.NODE_ENV === 'production') {
    return <h1>Hello Production</h1>
  } else {
    return <h1>Hello Other</h1>
  }
}
