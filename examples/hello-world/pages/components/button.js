import Button from "@material/react-button";

import "@material/react-button/dist/button.css";

const AppButton = ({ children, onClick, ...rest }) => (
  <Button {...rest} onClick={onClick}>
    {children}
  </Button>
);

export default AppButton;
