
type action =
 | Change(string)

type state = {
  newTodo: string,
};

let reducer = (_state, action) =>
  switch(action) {
  | Change(string) => { newTodo: string }
  };

[@react.component]
let make = (~day) => {
  let (state, dispatch) = React.useReducer(reducer, { newTodo: "" });
  let (appState, appDispatch) = TodoApp.useTodoReducer();
  let todos = appState->TodoApp.getDay(day);

  let addItem = () => {
    appDispatch(TodoApp.Add(day, TodoApp.Todo.make(state.newTodo)));
    dispatch(Change(""));
  };

  <div>
    <ul>
      (
        todos->Belt.Array.map(todo => {
         <li key=TodoApp.Todo.idGet(todo)>
           <p> {ReasonReact.string(todo->TodoApp.Todo.textGet)}</p>
         </li>
        })
      )->ReasonReact.array
    </ul>

    <p>
      <input
        placeholder="What needs to be done?"
        value=state.newTodo
        onChange={ev => dispatch(Change(ReactEvent.Form.target(ev)##value))}
      />
      <button onClick={ _ => addItem() }>
        {React.string("Add")}
      </button>
    </p>
  </div>

}
