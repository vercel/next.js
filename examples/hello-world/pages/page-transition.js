import { useTransition } from "react-spring";

export const transitionTemplate = {
  from: {
    position: "absolute",
    height: "100%",
    width: "100%",
    opacity: 0,
    zIndex: 1
  },
  enter: { opacity: 1 },
  leave: { opacity: 0 }
};

const usePageTransition = bool => useTransition(bool, null, transitionTemplate);

export default usePageTransition;
