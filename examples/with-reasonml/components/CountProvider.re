[@react.component]
let make = (~children) => {
  let reducer = React.useReducer(CountContext.reducer, CountContext.init);

  <CountContext.Provider value=reducer> children </CountContext.Provider>;
};
