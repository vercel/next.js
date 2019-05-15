
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

  <div>
    <ul>
      (
        todos->Belt.Array.map(todo => {
          Js.Console.log2("TODO ::", todo);
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
      <button onClick={
        _ => appDispatch(TodoApp.Add(day, TodoApp.Todo.make(state.newTodo)))
      }>
        {React.string("Add")}
      </button>
    </p>
  </div>

}
