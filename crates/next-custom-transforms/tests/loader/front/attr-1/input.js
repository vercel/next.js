export default function Foo() {
  return (
    <div render={(v) => <form></form>}>
      <style jsx>
        {`
          span {
            color: red;
          }
        `}
      </style>
    </div>
  )
}
