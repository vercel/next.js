import Tab from "@material/react-tab";
import TabBar from "@material/react-tab-bar";

import "@material/react-tab-bar/dist/tab-bar.css";
import "@material/react-tab-scroller/dist/tab-scroller.css";
import "@material/react-tab/dist/tab.css";
import "@material/react-tab-indicator/dist/tab-indicator.css";

const Tabs = ({ activeTab, list, onClick }) => (
  <TabBar
    activeIndex={activeTab}
    indexInView={activeTab}
    handleActiveIndexUpdate={onClick}
  >
    {list.map(({ name }, i) => (
      <Tab key={`${name}-${i}`} active={activeTab === i}>
        <span className="mdc-tab__text-label">{name}</span>
      </Tab>
    ))}
  </TabBar>
);

export default Tabs;
