export default function Layout(props) {
  return (
    <>
      <div>{props.children}</div>
      <div>{props.modal}</div>
    </>
  )
}
