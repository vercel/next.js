type props = {onServer: bool}

let default = props => {
  <div>
    <Header />
    <p> {React.string("HOME PAGE is here!")} </p>
    <p> {React.string("onServer: " ++ string_of_bool(props.onServer))} </p>
    <Counter />
  </div>
}

let getServerSideProps = _ctx => {
  open Js.Promise
  make((~resolve, ~reject as _) => {
    let props = {onServer: true}
    resolve(. {
      "props": props,
    })
  })
}
