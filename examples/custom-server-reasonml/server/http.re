type http;

[@bs.deriving abstract]
type parsedObjectUrl = {
  pathname: string,
  query: string,
};

module Request = {
  type t;
  [@bs.get] external url: t => string = "";
  [@bs.get] external method_: t => string = "method";
};

module Response = {
  type t;
  [@bs.send.pipe: t] external end_: 'a => unit = "end";
  [@bs.send] external setHeader: (t, string, string) => unit = "";
  [@bs.send] external writeHead: (t, int) => unit = "";
  let setHeader = (header: string, value: string, response: t) => {
    setHeader(response, header, value);
    response;
  };
  let writeHead = (status: int, response: t) => {
    writeHead(response, status);
    response;
  };
};

[@bs.module "http"]
external createServer: ((Request.t, Response.t) => unit) => http = "";

[@bs.send.pipe: http] external listen: (int, string => unit) => unit = "";

[@bs.module "url"] external parse: (string, bool) => parsedObjectUrl = "parse";