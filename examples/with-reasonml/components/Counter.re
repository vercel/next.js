let count = ref(0);

[@react.component]
let make = () => {
  let (_state, dispatch) = React.useReducer(
    (_, _) => Js.Obj.empty(),
    Js.Obj.empty()
  );

  let countMsg = "Count: " ++ string_of_int(count^);

  let add = () => {
    count := count^ + 1;
    dispatch();
  };

  <div>
    <p> {ReasonReact.string(countMsg)} </p>
    <button onClick={_ => add()}> {React.string("Add")} </button>
  </div>;
};

let default = make;
