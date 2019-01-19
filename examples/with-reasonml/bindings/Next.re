module Link = {
  [@bs.module "next/link"] external link: ReasonReact.reactClass = "default";
  let make =
      (
        ~href=?,
        ~_as=?,
        ~prefetch: option(bool)=?,
        ~replace: option(bool)=?,
        ~shallow: option(bool)=?,
        ~passHref: option(bool)=?,
        children,
      ) =>
    ReasonReact.wrapJsForReason(
      ~reactClass=link,
      ~props=
        Js.Undefined.{
          "href": fromOption(href),
          "as": fromOption(_as),
          "prefetch": fromOption(prefetch),
          "replace": fromOption(replace),
          "shallow": fromOption(shallow),
          "passHref": fromOption(passHref),
        },
      children,
    );
};

module Head = {
  [@bs.module "next/head"] external head: ReasonReact.reactClass = "default";
  let make = children => ReasonReact.wrapJsForReason(~reactClass=head, ~props=Js.Obj.empty(), children);
};

module Error = {
  [@bs.module "next/error"] external error: ReasonReact.reactClass = "default";
  let make = (~statusCode: int, children) =>
    ReasonReact.wrapJsForReason(~reactClass=error, ~props={"statusCode": statusCode}, children);
};
