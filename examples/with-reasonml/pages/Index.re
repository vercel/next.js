let component = ReasonReact.statelessComponent "Index";
let make _children => {
  ...component,
  render: fun _self => {
    <div>
      <Header />
      <p>(ReasonReact.stringToElement "HOME PAGE is here!")</p>
      <Counter />
    </div>
  }
};
let jsComponent =
  ReasonReact.wrapReasonForJs
    ::component
    (fun _jsProps => make [||])
