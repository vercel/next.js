import s from "styled-components";
const Test = s.div.withConfig({
    displayName: "Test",
    componentId: "sc-d5028521-0"
})`width: 100%;`;
const Test2 = true ? s.div.withConfig({
    displayName: "Test2",
    componentId: "sc-d5028521-1"
})`` : s.div.withConfig({
    displayName: "Test2",
    componentId: "sc-d5028521-2"
})``;
const styles = {
    One: s.div.withConfig({
        displayName: "One",
        componentId: "sc-d5028521-3"
    })``
};
let Component;
Component = s.div.withConfig({
    displayName: "Component",
    componentId: "sc-d5028521-4"
})``;
const WrappedComponent = s(Inner).withConfig({
    displayName: "WrappedComponent",
    componentId: "sc-d5028521-5"
})``;
