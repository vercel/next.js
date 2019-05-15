type state = {count: int};
type action =
  | Increment;
let init = {count: 0};
let reducer = (state, action) => {
  switch (action) {
  | Increment => {count: state.count + 1}
  };
};

type t = (state, action => unit);

include Context.Make({
  type context = t;
  let defaultValue = (
    init,
    _ => {
      ();
    },
  );
});
