const list = [1, 2, 3]

export default function Page() {
  return (
    <div>
      {list.map((item, index) => (
        <span>{item}</span>
      ))}
    </div>
  )
}
