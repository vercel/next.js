import styled from '@xstyled/styled-components';
const Test = styled.div.withConfig({
    componentId: "sc-2fd35b87-0"
})`
  width: 100%;
`;
const Test2 = true ? styled.div.withConfig({
    componentId: "sc-2fd35b87-1"
})`` : styled.div.withConfig({
    componentId: "sc-2fd35b87-2"
})``;
const styles = {
    One: styled.div.withConfig({
        componentId: "sc-2fd35b87-3"
    })``
};
let Component;
Component = styled.div.withConfig({
    componentId: "sc-2fd35b87-4"
})``;
const WrappedComponent = styled(Inner).withConfig({
    componentId: "sc-2fd35b87-5"
})``;
