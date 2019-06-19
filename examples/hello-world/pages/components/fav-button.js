import { IconToggle } from "@material/react-icon-button";
import styled from "styled-components";

import "@material/react-icon-button/dist/icon-button.css";

import Icon from "./icon";

const FavIcon = styled(Icon)`
  color: #e15864;
`;

const FavButton = ({ fav = false, onClick }) => (
  <button
    className={fav ? "mdc-icon-button--on mdc-icon-button" : "mdc-icon-button"}
    onClick={onClick}
  >
    <IconToggle isOn>
      <FavIcon icon="favorite" />
    </IconToggle>
    <IconToggle>
      <FavIcon icon="favorite_border" />
    </IconToggle>
  </button>
);

export default FavButton;
