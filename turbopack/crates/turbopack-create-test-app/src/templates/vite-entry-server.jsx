import ReactDOMServer from "react-dom/server";
import Triangle from "./triangle.jsx";

function App() {
  return (
    <svg height="100%" viewBox="-5 -4.33 10 8.66" style={{}}>
      <Triangle style={{ fill: "white" }} />
    </svg>
  );
}

export function render() {
  return ReactDOMServer.renderToString(<App />);
}
