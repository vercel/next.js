let component = ReasonReact.statefulComponent "Counter";
let make _children => {
  ...component,
  initialState: fun () => 0,
  render: fun self => {
    let countMsg = "Count: " ^ (string_of_int self.state);
    let onClick _evt {ReasonReact.state} => ReasonReact.Update (state + 1);

    <div>
      <p> (ReasonReact.stringToElement countMsg) </p>
      <button onClick=(self.update onClick)> (ReasonReact.stringToElement "Add") </button>
    </div>
  }
};
