[@react.component]
let make = () => {
  <div>
    <Header />
    <p> {ReasonReact.string("Things to do TOMORROW!")} </p>
    <TodoList day=TodoApp.Tomorrow />
  </div>;
};

let default = make;
