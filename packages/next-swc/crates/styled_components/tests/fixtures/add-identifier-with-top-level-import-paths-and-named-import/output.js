import { styled } from '@example/example';
const Test = styled.div.withConfig({
    displayName: "Test",
    componentId: "sc-bd3b1624-0"
})`
  width: 100%;
`;
const Test2 = true ? styled.div.withConfig({
    displayName: "Test2",
    componentId: "sc-bd3b1624-1"
})`` : styled.div.withConfig({
    displayName: "Test2",
    componentId: "sc-bd3b1624-2"
})``;
const styles = {
    One: styled.div.withConfig({
        displayName: "One",
        componentId: "sc-bd3b1624-3"
    })``
};
let Component;
Component = styled.div.withConfig({
    displayName: "Component",
    componentId: "sc-bd3b1624-4"
})``;
const WrappedComponent = styled(Inner).withConfig({
    displayName: "WrappedComponent",
    componentId: "sc-bd3b1624-5"
})``;
