open Fetch;
[%raw "require('isomorphic-fetch')"];


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
