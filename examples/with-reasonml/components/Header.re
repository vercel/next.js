
let styles = ReactDOMRe.Style.make(~marginRight="10px", ());

[@react.component]
let make = () => {
  <div>
    <Next.Link href="/">
      <a style=styles>{ReasonReact.string("Home")}</a>
    </Next.Link>
    <Next.Link href="/about">
      <a style=styles>{ReasonReact.string("About")}</a>
    </Next.Link>
  </div>
};

let default = make;
