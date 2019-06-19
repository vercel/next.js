import Menu, {
  MenuList,
  MenuListItem,
  MenuListItemText,
  MenuListItemGraphic
} from "@material/react-menu";
import MaterialIcon from "@material/react-material-icon";
import styled from "styled-components";
import useDarkMode from "use-dark-mode";

import "@material/react-menu/dist/menu.css";
import "@material/react-menu-surface/dist/menu-surface.css";

import { useAuthState } from "../session";
import { useFirebase } from "../firebase";
import { useCoffeeHour } from "../coffee-hour";
import notify from "../pages/notify";

const Avatar = styled.img`
  border-radius: 50%;
  height: 25px;
  width: 25px;
`;

const StyledMenuItem = styled(MenuListItem)`
  .mdc-list-item.mdc-ripple-upgraded {
    height: 60px;
  }

  .mdc-list-item__primary-text {
    display: flex;
  }
`;

const TopbarMenu = ({ open, coordinates, onClose }) => {
  const { firebaseDB, firebaseAuth } = useFirebase();
  const { authUser } = useAuthState();
  const { value, toggle } = useDarkMode(false);
  const coffeeHour = useCoffeeHour();

  const handleLogout = () => {
    authUser && firebaseAuth.signOut();
  };

  const onClick = async () => {
    try {
      await firebaseDB
        .collection("settings")
        .doc("admin")
        .update({
          is_bar_active: !coffeeHour
        });
    } catch (e) {
      notify({
        message: "Couldn't open Coffee bar. Please try again.",
        toastId: "open-coffee-error",
        action: "Retry",
        onActionClick: () => {
          onClick();
        }
      });
      console.log(e);
    }
  };

  return (
    <Menu open={open} onClose={onClose} coordinates={coordinates}>
      <MenuList>
        <StyledMenuItem>
          {authUser && (
            <>
              <MenuListItemGraphic
                graphic={<Avatar src={`${authUser.photoURL}`} alt="Avatar" />}
              />
              <MenuListItemText
                primaryText={`${authUser.displayName}`}
                secondaryText={`${authUser.email}`}
              />
            </>
          )}
        </StyledMenuItem>
        <MenuListItem onClick={toggle}>
          <MenuListItemGraphic
            graphic={
              <MaterialIcon icon={value ? "brightness_5" : "brightness_2"} />
            }
          />
          <MenuListItemText primaryText="Dark Mode" />
        </MenuListItem>
        <MenuListItem onClick={onClick}>
          <MenuListItemGraphic
            graphic={
              <MaterialIcon icon={coffeeHour ? "block" : "free_breakfast"} />
            }
          />
          <MenuListItemText
            primaryText={coffeeHour ? "Close Coffee Bar" : "Open Coffee Bar"}
          />
        </MenuListItem>
        <MenuListItem onClick={handleLogout}>
          <MenuListItemGraphic graphic={<MaterialIcon icon="exit_to_app" />} />
          <MenuListItemText primaryText="Logout" />
        </MenuListItem>
      </MenuList>
    </Menu>
  );
};

export default TopbarMenu;
