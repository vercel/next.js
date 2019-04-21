
[@react.component]
let make = () => {
  <div>
    <Header />
    <p> (ReasonReact.string("This is the about page.")) </p>
    <Counter />
  </div>
};

let default = make;
