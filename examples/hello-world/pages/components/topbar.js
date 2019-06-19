import { useState, memo } from "react";
import TopAppBar, {
  TopAppBarFixedAdjust,
  TopAppBarIcon,
  TopAppBarRow,
  TopAppBarSection,
  TopAppBarTitle
} from "@material/react-top-app-bar";

import "@material/react-top-app-bar/dist/top-app-bar.css";
import "@material/react-material-icon/dist/material-icon.css";

import Icon from "./icon";
import Logo from "./logo";
import TopbarMenu from "./topbar-menu";

const Topbar = () => {
  const [open, setOpen] = useState(false);
  const [coordinates, setCoordinates] = useState();

  const onClick = e => {
    setOpen(!open);
    setCoordinates({ x: e.clientX, y: e.clientY });
    // Must preventDefault so the system context menu doesn't appear.
    // This won't be needed in other cases besides right click.
    e.preventDefault();
  };

  const onClose = () => {
    setOpen(false);
  };

  return (
    <div>
      <TopAppBar>
        <TopAppBarRow>
          <TopAppBarSection align="start">
            <TopAppBarTitle>
              <Logo />
            </TopAppBarTitle>
          </TopAppBarSection>

          <TopAppBarSection align="end" role="toolbar">
            <TopAppBarIcon actionItem tabIndex={0} onClick={onClick}>
              <Icon hasRipple icon="more_vert" />
            </TopAppBarIcon>
          </TopAppBarSection>
          <TopbarMenu open={open} coordinates={coordinates} onClose={onClose} />
        </TopAppBarRow>
      </TopAppBar>
      <TopAppBarFixedAdjust />
    </div>
  );
};

export default memo(Topbar);
