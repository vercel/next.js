import { animated } from "react-spring";

import Topbar from "./components/topbar";
import Coffee from "./coffee";
import Empty from "./pages/empty";
import CoffeeAdmin from "./coffee-admin";
import { useCoffeeHour } from "./coffee-hour";
import { useAdmin } from "./admin";
import usePageTransition from "./page-transition";

const Main = () => {
  const coffeeHour = useCoffeeHour();
  const admin = useAdmin();

  const coffeeTransition = usePageTransition(coffeeHour);

  return (
    <>
      <Topbar />
      {admin ? (
        <CoffeeAdmin />
      ) : (
        <>
          {coffeeTransition.map(({ item, key, props }) =>
            item ? (
              <animated.div key={key} style={props}>
                <Coffee />
              </animated.div>
            ) : (
              <animated.div key={key} style={props}>
                <Empty />
              </animated.div>
            )
          )}
        </>
      )}
    </>
  );
};

export default Main;
