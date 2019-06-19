import styled from "styled-components";
import IconButton from "@material/react-icon-button";
import MaterialIcon from "@material/react-material-icon";

import "@material/react-material-icon/dist/material-icon.css";
import "@material/react-icon-button/dist/icon-button.css";

import Button from "./button";

const StyledSnack = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SnackBody = styled.div`
  padding: 8px 16px;
`;

const SnackActions = styled.div`
  display: flex;
  align-items: center;

  button:first-child {
    color: #e15864;
  }

  button:last-child {
    margin-left: 8px;
  }
`;

const StyledIcon = styled(MaterialIcon)`
  cursor: pointer;
  width: 24px;
  height: 24px;
`;

const Snack = ({ message, action, onActionClick, closeToast }) => (
  <StyledSnack>
    <SnackBody>{message}</SnackBody>
    <SnackActions>
      {action && <Button onClick={onActionClick}>{action}</Button>}
      <IconButton>
        <StyledIcon icon="close" onClick={closeToast} />
      </IconButton>
    </SnackActions>
  </StyledSnack>
);

export default Snack;
