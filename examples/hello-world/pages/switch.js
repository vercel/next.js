import { useTransition, animated } from "react-spring";

import { useAuthState } from "./session";
import LoginForm from "./pages/login-form";
import Main from "./main";
import Loader from "./components/loader";
import usePageTransition, { transitionTemplate } from "./page-transition";

const Check = () => {
  const { authUser, loading } = useAuthState();

  const loadingTransition = useTransition(loading, null, {
    ...transitionTemplate,
    from: { ...transitionTemplate.from, zIndex: 2 }
  });
  const appTransition = usePageTransition(authUser);

  return (
    <>
      {loadingTransition.map(
        ({ item, key, props }) =>
          item && (
            <animated.div key={key} style={props}>
              <Loader />
            </animated.div>
          )
      )}
      {appTransition.map(({ item, key, props }) =>
        item ? (
          <animated.div key={key} style={props}>
            <Main />
          </animated.div>
        ) : (
          <animated.div key={key} style={props}>
            <LoginForm />
          </animated.div>
        )
      )}
    </>
  );
};

export default Check;
