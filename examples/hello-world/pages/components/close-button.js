import styled from "styled-components";
import IconButton from "@material/react-icon-button";
import MaterialIcon from "@material/react-material-icon";

import "@material/react-material-icon/dist/material-icon.css";
import "@material/react-icon-button/dist/icon-button.css";

const StyledIcon = styled(MaterialIcon)`
  cursor: pointer;
`;

const CloseButton = ({ onClick }) => (
  <IconButton>
    <StyledIcon name="close" onClick={onClick} />
  </IconButton>
);

export default CloseButton;
