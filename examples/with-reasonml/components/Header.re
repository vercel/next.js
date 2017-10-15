let component = ReasonReact.statelessComponent "Header";
let styles = ReactDOMRe.Style.make
  marginRight::"10px"
  ();
let make _children => {
  ...component,
  render: fun _self => {
    <div>
      <a href="/" style=styles> (ReasonReact.stringToElement "Home") </a>
      <a href="/about" style=styles> (ReasonReact.stringToElement "About") </a>
    </div>
  }
};
