import React from "react";
import { css } from "styled-components";
import Icons from "./icons";

const someCss = css` background: purple;`;

const App1 = () => { return <Icons css={someCss} />; };

const App2 = () => { return <Icons.Foo css={someCss} />; };

const App3 = () => { return <Icons.Foo.Bar css={someCss} />; };
