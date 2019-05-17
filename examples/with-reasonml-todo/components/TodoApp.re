module TodoId = {
  type t = string;

  let prefix = ref(0);

  let make = () => {
    let prefix = Js.Math.random_int(1000000, 9999999)->string_of_int;
    let suffix = Js.Date.now()->int_of_float->string_of_int;

    {j|$prefix::$suffix|j}
  }
};
module Todo = {
  [@bs.deriving abstract]
  type t = {
    id: TodoId.t,
    mutable finished: bool,
    text: string,        
  };

  let make = (~finished=false, text) => t(~id=TodoId.make(), ~finished, ~text);

  let complete = t => {
    t->finishedSet(true);
    t
  }

  let isSame = (t1, t2) => t1->idGet === t2->idGet
};

module TodoList = {
  type t = array(Todo.t);

  let contains = (list, todo) => list->Belt.Array.some(Todo.isSame(todo));

  let complete = (list, target) =>
    list->Belt.Array.map(todo =>
      todo->Todo.isSame(target) ? todo->Todo.complete : todo
    );

  let add = (list, todo) => {
    if (!list->contains(todo)) {
      list->Belt.Array.concat([|todo|])
    } else {
      // panic - should be unreachable
      let id = todo->Todo.idGet;
      Js.Exn.raiseError({j|Could not add todo $id, it already exists.|j});
    }
  }

  let remove = (list, todo) =>
    list->Belt.Array.keep(current => !todo->Todo.isSame(current));
}

type t = {
  today: TodoList.t,
  tomorrow: TodoList.t,
}

type day =
  | Today
  | Tomorrow;

type action =
  | Add(day, Todo.t)
  | Complete(day, Todo.t)
  | Remove(day, Todo.t)

let appState = ref({ today: [||], tomorrow: [||] });

let add = (state, day, todo) => {
  switch(day) {
  | Today => { ...state, today: state.today->TodoList.add(todo) }
  | Tomorrow => { ...state, tomorrow: state.tomorrow->TodoList.add(todo) }
  }
}

let complete = (state, day, todo) => {
  switch(day) {
  | Today => { ...state, today: state.today->TodoList.complete(todo) }
  | Tomorrow => { ...state, tomorrow: state.tomorrow->TodoList.complete(todo) }
  }
}

let remove = (state, day, todo) => {
  switch(day) {
  | Today => { ...state, today: state.today->TodoList.remove(todo) }
  | Tomorrow => { ...state, tomorrow: state.tomorrow->TodoList.remove(todo) }
  }
}

let getDay = (state, day) => {
  switch(day) {
  | Today => state.today
  | Tomorrow => state.tomorrow
  }
}

let reducer = (state, action) => {
  let newState = switch(action) {
  | Add(day, todo) => add(state, day, todo)
  | Complete(day, todo) => complete(state, day, todo)
  | Remove(day, todo) => remove(state, day, todo)
  };

  appState := newState;

  newState;
}

let useTodoReducer = () => React.useReducer(reducer, appState^);
