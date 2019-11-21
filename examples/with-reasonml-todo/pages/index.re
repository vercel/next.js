[@react.component]
let make = (~onServer) => {
  <div>
    <Header />
    <p> {ReasonReact.string("Things todo TODAY!")} </p>
    <p> {ReasonReact.string("onServer: " ++ string_of_bool(onServer))} </p>
    <TodoList day=TodoApp.Today />
  </div>;
};

let default = make;

let getInitialProps = context =>
  Js.Promise.make((~resolve, ~reject as _) => {
    let onServer =
      switch (Js.Nullable.toOption(context##req)) {
      | None => false
      | Some(_) => true
      };
    resolve(. {"onServer": onServer});
  });

let inject:
  (
    Js.t('a) => React.element,
    {. "req": Js.Nullable.t(Js.t('a))} => Js.Promise.t(Js.t('a))
  ) =>
  unit = [%bs.raw
  {| (cls, fn) => cls.getInitialProps = fn |}
];

inject(default, getInitialProps);
