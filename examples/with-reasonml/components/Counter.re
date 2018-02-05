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
      <p> (ReasonReact.stringToElement(countMsg)) </p>
      <button onClick=(self.reduce((_event) => Add))>
        (ReasonReact.stringToElement("Add"))
      </button>
    </div>
  }
};