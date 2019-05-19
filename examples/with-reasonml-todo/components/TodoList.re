
type action =
 | Change(string)
 | NoChange
 | Submit(TodoApp.day, TodoApp.action => unit)

type state = {
  newTodo: string,
};

let reducer = (state, action) =>
  switch(action) {
  | Change(string) => { newTodo: string }
  | NoChange => state
  | Submit(day, appDispatch) =>
    appDispatch(TodoApp.Add(day, TodoApp.Todo.make(state.newTodo)));
    { newTodo: "" }
  };

[@react.component]
let make = (~day) => {
  let (state, dispatch) = React.useReducer(reducer, { newTodo: "" });
  let (appState, appDispatch) = TodoApp.useTodoReducer();
  let todos = appState->TodoApp.getDay(day);

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
        onKeyDown={
          ev =>
            if (ReactEvent.Keyboard.keyCode(ev) === 13) {
              ReactEvent.Keyboard.preventDefault(ev);
              dispatch(Submit(day, appDispatch));
            }
        }
      />
      <button onClick={ _ => dispatch(Submit(day, appDispatch)) }>
        {React.string("Add")}
      </button>
    </p>
  </div>

}
