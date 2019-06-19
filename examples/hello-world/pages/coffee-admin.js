import { useState } from "react";
import styled from "styled-components";
import { useTransition, animated } from "react-spring";

import TabsBar from "./components/tabs";
import CurrentOrders from "./pages/current-orders";

const AnimationContainer = styled.div`
  position: relative;

  & > div {
    position: absolute;
    width: 100%;
    height: 100%;
  }
`;

const Tabs = [
  {
    name: "Current Orders",
    page: ({ style, ...rest }) => (
      <animated.div style={{ ...style }}>
        <CurrentOrders />
      </animated.div>
    )
  }
];

const Root = () => {
  const [tab, setTab] = useState(0);
  const transitions = useTransition(tab, p => p, {
    from: { opacity: 0, transform: "translate3d(100%,0,0)" },
    enter: { opacity: 1, transform: "translate3d(0%,0,0)" },
    leave: { opacity: 0, transform: "translate3d(-50%,0,0)" }
  });

  const handleClick = index => {
    setTab(index);
  };

  return (
    <>
      <TabsBar list={Tabs} activeTab={tab} onClick={handleClick} />
      <AnimationContainer>
        {transitions.map(({ item, props, key }) => {
          const { page: Page } = Tabs[item];
          return <Page key={key} style={props} />;
        })}
      </AnimationContainer>
    </>
  );
};

export default Root;
