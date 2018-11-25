type action =
  | Add;

let component = ReasonReact.reducerComponent("Counter");

let make = (_children) => {
  ...component,
  initialState: () => 0,
  reducer: (action, state) =>
    switch action {
    | Add => ReasonReact.Update(state + 1)
    },
  render: (self) => {
    let countMsg = "Count: " ++ string_of_int(self.state);
    <div>
      <p> (ReasonReact.string(countMsg)) </p>
      <button onClick=(_event => self.send(Add))>
        (ReasonReact.string("Add"))
      </button>
    </div>
  }
};
