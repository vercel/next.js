module Next = {
  let inject = (_cls: Js.t({..}) => React.element, _fn) => [%bs.raw
    {| _cls.getInitialProps = _fn |}
  ];
};

module BlogPostsPage = {
  [@react.component]
  let make = () => {
    let viewerData = Query.Viewer.use(~variables=(), ());
    <BlogPosts viewer={viewerData.viewer.getFragmentRefs()} />;
  };
};

[@react.component]
let make = (~records) => {
  <ReasonRelay.Context.Provider environment={RelayEnv.createEnvironment(~records, ())}>
    <div> <BlogPostsPage /> </div>
  </ReasonRelay.Context.Provider>;
};

let getInitialProps = _context => {
  let environment = RelayEnv.createEnvironment();
  let promise = Query.Viewer.fetchPromised(~environment, ~variables=());

  Promise.mapOk(
    promise,
    _p => {
      let records =
        environment
        ->ReasonRelay.Environment.getStore
        ->ReasonRelay.Store.getSource
        ->ReasonRelay.RecordSource.toJSON;
      {"records": records};
    },
  )
  ->Promise.Js.toBsPromise;
};

let default = make;

Next.inject(default, getInitialProps);
