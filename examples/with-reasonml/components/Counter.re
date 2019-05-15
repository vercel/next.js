/*
    This is the set of action messages which are produced by this component.
    * Add updates the components internal state.
    * IncrementGlobal increments a global counter which is persisted across
       usages of this component.
 */
type action =
  | Add

/*
   This is the components internal state representation. This state object
   is unique to each instance of the component.

   The global counter must be part of the state because the component will
   only re-render if the state has been changed.
 */
type state = {
  count: int,
};

let counterReducer = (state, action) =>
  switch(action) {
  | Add => { count: state.count + 1 }
  };

[@react.component]
let make = () => {
  let (state, dispatch) = React.useReducer(counterReducer, { count: 0 });
  let (globalState, globalDispatch) = GlobalCount.useGlobalCount();

  let countMsg = "Count: " ++ string_of_int(state.count);
  let persistentCountMsg = "Persistent Count " ++ string_of_int(globalState);

  <div>
    <p> {ReasonReact.string(countMsg)} </p>
    <button onClick={_ => dispatch(Add)}> {React.string("Add")} </button>
    <p> {ReasonReact.string(persistentCountMsg)} </p>
    <button onClick={_ => globalDispatch(GlobalCount.Increment)}>
      {React.string("Add")}
    </button>
  </div>;
};

let default = make;
