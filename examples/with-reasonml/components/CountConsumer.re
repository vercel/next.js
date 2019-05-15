type reducer = (CountContext.state, CountContext.action => unit);

[@react.component]
let make = () => {
  let ({count}, dispatch): reducer = React.useContext(CountContext.x);

  <div>
    <div> {j|This is the count: $count|j}->React.string </div>
    <button onClick={_e => dispatch(CountContext.Increment)}>
      "Increment count"->React.string
    </button>
  </div>;
};
