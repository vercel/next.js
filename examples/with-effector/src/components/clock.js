import { useStore } from "effector-react/scope";
import { $light, $timeString } from "../model";

export const Clock = () => {
  const light = useStore($light);
  const timeString = useStore($timeString);

  return (
    <div className={light ? "light" : ""}>
      {timeString}
      <style jsx>{`
        div {
          padding: 15px;
          color: #82fa58;
          display: inline-block;
          font: 50px menlo, monaco, monospace;
          background-color: #000;
        }

        .light {
          background-color: #999;
        }
      `}</style>
    </div>
  );
};
