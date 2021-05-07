let styles = ReactDOM.Style.make(~marginRight="10px", ())

@react.component
let make = () =>
  <div>
    <Next.Link href="/"> <a style=styles> {React.string("Home")} </a> </Next.Link>
    <Next.Link href="/about"> <a style=styles> {React.string("About")} </a> </Next.Link>
  </div>

let default = make
