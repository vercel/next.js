let component = ReasonReact.statelessComponent "About";
let make _children => {
  ...component,
  render: fun _self => {
    <div>
      <Header />
      <p>(ReasonReact.stringToElement "This is the about page.")</p>
      <Counter />
    </div>
  }
};
let jsComponent =
  ReasonReact.wrapReasonForJs
    ::component
    (fun _jsProps => make [||])
