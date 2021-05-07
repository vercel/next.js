/*
    This is the set of action messages which are produced by this component.
    Add updates the components internal state.
 */
type action = Add

/*
   This is the components internal state representation. This state object
   is unique to each instance of the component.
 */
type state = {count: int}

let counterReducer = (state, action) =>
  switch action {
  | Add => {count: state.count + 1}
  }

@react.component
let make = () => {
  let (state, dispatch) = React.useReducer(counterReducer, {count: 0})
  let (globalState, globalDispatch) = GlobalCount.useGlobalCount()

  let countMsg = "Count: " ++ Belt.Int.toString(state.count)
  let persistentCountMsg = "Persistent Count " ++ Belt.Int.toString(globalState)

  <div>
    <p> {React.string(countMsg)} </p>
    <button onClick={_ => dispatch(Add)}> {React.string("Add")} </button>
    <p> {React.string(persistentCountMsg)} </p>
    <button onClick={_ => globalDispatch(GlobalCount.Increment)}> {React.string("Add")} </button>
  </div>
}

let default = make
