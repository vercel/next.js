import { useEffect, useState } from "react";
import { requireComponentDependancyByName } from "../dependancies";

export default function ContentZone(props) {
  const [modules, setModules] = useState([]);

  useEffect(() => {
    const loadModules = async () => {
      const zoneModules = props.page.zones[props.name];
      const loadedModules = await Promise.all(
        zoneModules.map(async (m) => {
          const Component = await requireComponentDependancyByName(m.moduleName);
          return {
            Component,
            props: m.item
          };
        })
      );
      setModules(loadedModules);
    };

    loadModules();
  }, [props.page.zones, props.name]);

  return (
    <div>
      {modules.map(({ Component, props: moduleProps }, index) => (
        <Component key={index} {...moduleProps} />
      ))}
    </div>
  );
}