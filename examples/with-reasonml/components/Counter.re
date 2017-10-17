type action =
  | Add;

let component = ReasonReact.reducerComponent "Counter";

let make _children => {
  ...component,
  initialState: fun () => 0,
  reducer: fun action state =>
    switch action {
    | Add => ReasonReact.Update {state + 1}
    },
  render: fun self => {
    let countMsg = "Count: " ^ (string_of_int self.state);

    <div>
      <p> (ReasonReact.stringToElement countMsg) </p>
      <button onClick=(self.reduce (fun _event => Add))> (ReasonReact.stringToElement "Add") </button>
    </div>
  }
};
