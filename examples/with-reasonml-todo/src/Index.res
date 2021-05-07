type props = {onServer: bool}

let default = props =>
  <div>
    <Header />
    <p> {React.string("Things todo TODAY!")} </p>
    <p> {React.string("onServer: " ++ string_of_bool(props.onServer))} </p>
    <TodoList day=TodoApp.Today />
  </div>

let getServerSideProps = _ctx => {
  open Js.Promise
  make((~resolve, ~reject as _) => {
    let props = {onServer: true}
    resolve(. {
      "props": props,
    })
  })
}
