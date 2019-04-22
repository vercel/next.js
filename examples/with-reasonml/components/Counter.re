type action =
  | Add;

type state = {
  count: int,
};

[@react.component]
let make = () => {
  let (state, dispatch) = React.useReducer(
    (state, action) =>
      switch (action) {
      | Add => { count: state.count + 1 }
      },
    { count: 0 }
  );

  let countMsg = "Count: " ++ string_of_int(state.count);

  <div>
    <p> {ReasonReact.string(countMsg)} </p>
    <button onClick={ _ => dispatch(Add) }>
      {React.string("Add")}
    </button>
  </div>
};

let default = make;
