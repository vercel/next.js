let component = ReasonReact.statelessComponent("About");

let make = (_children) => {
  ...component,
  render: (_self) =>
    <div>
      <Header />
      <p> (ReasonReact.stringToElement("This is the about page.")) </p>
      <Counter />
    </div>
};

let default = ReasonReact.wrapReasonForJs(~component, (_jsProps) => make([||]));
