import s from "styled-components";

const Test = s.div`width: 100%;`;
const Test2 = true ? s.div`` : s.div``;
const styles = { One: s.div`` }
let Component;
Component = s.div``;
const WrappedComponent = s(Inner)``;
