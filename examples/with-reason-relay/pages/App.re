open Fetch;
module Next = {
  let inject = (_cls: Js.t({..}) => React.element, _fn) => [%bs.raw
    {| _cls.getInitialProps = _fn |}
  ];
};

/* RelayEnv.re */
/* This is just a custom exception to indicate that something went wrong. */
exception Graphql_error(string);
/**
 * A standard fetch that sends our operation and variables to the
 * GraphQL server, and then decodes and returns the response.
 */
let fetchQuery: ReasonRelay.Network.fetchFunctionPromise =
  (operation, variables, _cacheConfig) => {
    let uri: string = [%raw "process.env.RELAY_ENDPOINT"];
    fetchWithInit(
      uri,
      RequestInit.make(
        ~method_=Post,
        ~body=
          Js.Dict.fromList([
            ("query", Js.Json.string(operation.text)),
            ("variables", variables),
          ])
          |> Js.Json.object_
          |> Js.Json.stringify
          |> BodyInit.make,
        ~headers=
          HeadersInit.make({
            "content-type": "application/json",
            "accept": "application/json",
          }),
        (),
      ),
    )
    |> Js.Promise.then_(resp =>
         if (Response.ok(resp)) {
           Response.json(resp);
         } else {
           Js.Promise.reject(
             Graphql_error("Request failed: " ++ Response.statusText(resp)),
           );
         }
       );
  };

let createEnvironment = (~records=?, ()) => {
  let source = ReasonRelay.RecordSource.make(~records?, ());
  let store = ReasonRelay.Store.make(~source, ());
  let network =
    ReasonRelay.Network.makePromiseBased(~fetchFunction=fetchQuery, ());

  ReasonRelay.Environment.make(~network, ~store, ());
};

[@react.component]
let make = (~viewer: Query_Query_graphql.Types.response_viewer, ~records) => {
  Js.log2("render viewer", viewer);
  Js.log2("render records", records);
  <ReasonRelay.Context.Provider environment={createEnvironment(~records, ())}>
    <div> <BlogPosts viewer={viewer.getFragmentRefs()} /> </div>
  </ReasonRelay.Context.Provider>;
};

let getInitialPropsRe = _context => {
  let environment = createEnvironment();
  let promise = Query.Viewer.fetchPromised(~environment, ~variables=());
  let records =
    environment
    ->ReasonRelay.Environment.getStore
    ->ReasonRelay.Store.getSource
    ->ReasonRelay.RecordSource.toJSON;

  Promise.mapOk(
    promise,
    p => {
      Js.log2("getInitialProps viewer", p);
      Js.log2("getInitialProps records", records);
      {"props": {"viewer": p.viewer, "records": records}};
    },
  )
  ->Promise.Js.toBsPromise;
};

let getInitialProps = [%bs.raw {|
  async function () {
    return await getInitialPropsRe();
  }
|}];

let default = make;

Next.inject(default, getInitialProps);
