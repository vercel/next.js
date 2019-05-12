/*
    ## Global Count
    This captures the count globally so that it will be persisted across
    the `Index` and `About` pages.  This replicates the functionality
    of the shared-modules example.
 */
module GlobalCount = {
  type t = ref(int);

  let current = ref(0);

  let increment = () => {
    current := current^ + 1;
    current;
  };

  let getString = () => string_of_int(current^);
};

/*
    This is the set of action messages which are produced by this component.
    * Add updates the components internal state.
    * IncrementGlobal increments a global counter which is persisted across
       usages of this component.
 */
type action =
  | Add
  | IncrementGlobal;

/*
   This is the components internal state representation. This state object
   is unique to each instance of the component.

   The global counter must be part of the state because the component will
   only re-render if the state has been changed.
 */
type state = {
  count: int,
  global: GlobalCount.t,
};

[@react.component]
let make = () => {
  let incrementGlobal = state => {
    let _ = GlobalCount.increment();
    let _ = Js.Console.log("Incrementing global count");
    {count: state.count, global: GlobalCount.current};
  };

  let (state, dispatch) =
    React.useReducer(
      (state, action) =>
        switch (action) {
        | Add => {count: state.count + 1, global: GlobalCount.current}
        | IncrementGlobal => incrementGlobal(state)
        },
      {count: 0, global: GlobalCount.current},
    );

  let countMsg = "Count: " ++ string_of_int(state.count);
  let persistentCountMsg = "Persistent Count " ++ GlobalCount.getString();

  <div>
    <p> {ReasonReact.string(countMsg)} </p>
    <button onClick={_ => dispatch(Add)}> {React.string("Add")} </button>
    <p> {ReasonReact.string(persistentCountMsg)} </p>
    <button onClick={_ => dispatch(IncrementGlobal)}>
      {React.string("Add")}
    </button>
  </div>;
};

let default = make;
