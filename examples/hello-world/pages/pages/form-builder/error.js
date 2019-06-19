import React from "react";
import styled from "styled-components";
import { Caption } from "@material/react-typography";

const ErrorMessage = styled(Caption)`
  color: #b00020;
`;

const Error = props => <ErrorMessage {...props} />;

export default Error;
