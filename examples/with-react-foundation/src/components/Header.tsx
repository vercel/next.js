// Import react-foundation components
import { Menu, MenuItem } from "react-foundation";

export const Header = () => {
  return (
    <Menu>
      <MenuItem>
        <a href="/">Home</a>
      </MenuItem>
      <MenuItem>
        <a href="/">Blog</a>
      </MenuItem>
      <MenuItem>
        <a href="/">About</a>
      </MenuItem>
      <MenuItem>
        <a href="/">Contact</a>
      </MenuItem>
    </Menu>
  );
};
