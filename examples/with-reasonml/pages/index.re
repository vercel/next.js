let component = ReasonReact.statelessComponent("Index");

let make = (_children) => {
  ...component,
  render: (_self) =>
    <div>
      <Header />
      <p> (ReasonReact.stringToElement("HOME PAGE is here!")) </p>
      <Counter />
    </div>
};

let default = ReasonReact.wrapReasonForJs(~component, (_jsProps) => make([||]));
