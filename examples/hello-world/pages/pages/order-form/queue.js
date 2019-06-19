import styled from "styled-components";
import { useTransition, animated } from "react-spring";

const CircleContainer = styled.svg`
  height: 145px;
`;

const colors = ["#ee7094", "#f39ab3", "#f6bacb", "#f9d4de", "#FFFFFF"];
const size = [50, 40, 30, 20, 10];

const Queue = ({ queue }) => {
  const queueToUse =
    queue.length > 5 ? queue.slice(queue.length - 5, queue.length) : queue;
  const transitions = useTransition(queueToUse, item => item.key, {
    enter: { opacity: 1 },
    leave: { opacity: 0 }
  });
  return (
    <CircleContainer viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {transitions
        .map(({ key, props }, i) => (
          <animated.circle
            key={key}
            style={props}
            fill={colors[queueToUse.length >= 5 ? i : size.length - 1 - i]}
            cx="50"
            cy="50"
            r={size[queueToUse.length >= 5 ? i : size.length - 1 - i]}
          />
        ))
        .reverse()}
    </CircleContainer>
  );
};

export default Queue;
