import { useRef } from "react";
import styled from "styled-components";
import { useSpring, animated, interpolate } from "react-spring";
import { useGesture } from "react-use-gesture";

import Icon from "./icon";

const CenteredIcon = styled(Icon)`
  position: absolute;
  right: 16px;
  top: calc(50% - 25px);
  color: #ffffff;
  font-size: 50px;
`;

const Swipe = ({ data, swipeAction, children }) => {
  const delta = useRef([0, 0]);
  const [{ x, bg, size }, set] = useSpring(() => ({
    x: 0,
    bg: "#EA5D6A",
    size: 1
  }));

  const bind = useGesture({
    onDrag: ({ delta: innerDelta, down: innerDown }) => {
      delta.current = innerDelta;

      set({
        x: innerDown ? innerDelta[0] : 0,
        bg: "#EA5D6A",
        size: innerDown ? 1.025 : 1,
        immediate: name => innerDown && name === "x"
      });
    },
    onDragEnd: ({ delta: innerDelta, down: innerDown }) => {
      const trigger = innerDelta[0] <= -250;
      if (!innerDown && trigger && swipeAction) swipeAction(data);
    }
  });

  const avSize = x.interpolate({
    map: Math.abs,
    range: [50, 300],
    output: ["scale(0.5)", "scale(1)"],
    extrapolate: "clamp"
  });

  return (
    <animated.div
      {...bind()}
      style={{ background: bg, borderRadius: "4px", position: "relative" }}
    >
      <CenteredIcon icon="done" />
      <animated.div
        style={{
          transform: avSize,
          justifySelf: delta.current[0] < 0 ? "end" : "start"
        }}
      />
      <animated.div
        style={{
          transform: interpolate(
            [x, size],
            (x, s) => `translate3d(${x > 0 ? 0 : x}px,0,0) scale(${s})`
          )
        }}
      >
        {children}
      </animated.div>
    </animated.div>
  );
};

export default Swipe;
