import styled from 'styled-components';
const Test = styled.div.withConfig({
    componentId: "sc-bc9ba4b0-0"
})`
  width: 100%;
`;
const Test2 = true ? styled.div.withConfig({
    componentId: "sc-bc9ba4b0-1"
})`` : styled.div.withConfig({
    componentId: "sc-bc9ba4b0-2"
})``;
const styles = {
    One: styled.div.withConfig({
        componentId: "sc-bc9ba4b0-3"
    })``
};
let Component;
Component = styled.div.withConfig({
    componentId: "sc-bc9ba4b0-4"
})``;
const WrappedComponent = styled(Inner).withConfig({
    componentId: "sc-bc9ba4b0-5"
})``;
