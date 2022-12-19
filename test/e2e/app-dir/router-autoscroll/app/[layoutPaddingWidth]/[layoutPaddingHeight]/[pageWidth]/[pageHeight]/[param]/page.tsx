export default function Page() {
  const randomColor = Math.floor(Math.random() * 16777215).toString(16)
  return (
    <div
      id="page"
      style={{
        background: `#${randomColor}`,
        flexGrow: 1,
      }}
    />
  )
}
