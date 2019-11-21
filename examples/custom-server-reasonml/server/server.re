open Http;

[@bs.deriving abstract]
type nextparams = {dev: bool};

type nextoutput;
[@bs.send] external prepare: nextoutput => Js.Promise.t(unit) = "";

[@bs.send]
external getRequestHandler:
  (nextoutput, unit) => (. Request.t, Response.t, parsedObjectUrl) => unit =
  "";

[@bs.send]
external render: (nextoutput, Request.t, Response.t, string, string) => unit =
  "";

[@bs.module] external next: nextparams => nextoutput = "next";

[@bs.val] [@bs.scope ("process", "env")]
external port: Js.Nullable.t(int) = "PORT";

[@bs.val] [@bs.scope ("process", "env")]
external node_env: string = "NODE_ENV";

[@bs.val] external parseInt: (int, int) => int = "parseInt";
let port =
  switch (Js.Nullable.toOption(port)) {
  | Some(port) => port
  | None => 3000
  };
let is_dev = node_env != "production";

let nxt = nextparams(~dev=is_dev);
let app = next(nxt);

let handle = getRequestHandler(app, ());

Js.Promise.(
  prepare(app)
  |> then_(() => {
       createServer((req, res) => {
         let parsedUrl = parse(Request.url(req), true);
         let pathname = pathnameGet(parsedUrl);
         let query = queryGet(parsedUrl);

         switch (pathname) {
         | "/a" => app->render(req, res, "/a", query)
         | "/b" => app->render(req, res, "/b", query)
         | _ => handle(. req, res, parsedUrl)
         };
       })
       |> listen(port, _err =>
            print_string(
              "> Listening on port http://localhost:" ++ string_of_int(port),
            )
          );

       resolve(print_string(""));
     })
);