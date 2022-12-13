export default function Debug({ name, value }) {
  return (
    <>
      <dt>{name}</dt>
      <dd id={name}>{value}</dd>
    </>
  )
}
