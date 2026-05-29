const pad = (n) => (n < 10 ? `0${n}` : n);
const format = (t) =>
  `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;

const Clock = (props) => {
  const divStyle = {
    backgroundColor: props.light ? "#999" : "#000",
    color: "#82FA58",
    display: "inline-block",
    font: "50px menlo, monaco, monospace",
    padding: "15px",
  };
  return <div style={divStyle}>{format(new Date(props.lastUpdate))}</div>;
};

export default Clock;
