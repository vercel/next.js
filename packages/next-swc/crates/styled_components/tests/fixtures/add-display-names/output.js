import styled from 'styled-components';
const Test = styled.div.withConfig({
    displayName: "Test"
})`
  width: 100%;
`;
const Test2 = styled('div').withConfig({
    displayName: "Test2"
})``;
const Test3 = true ? styled.div.withConfig({
    displayName: "Test3"
})`` : styled.div.withConfig({
    displayName: "Test3"
})``;
const styles = {
    One: styled.div.withConfig({
        displayName: "One"
    })``
};
let Component;
Component = styled.div.withConfig({
    displayName: "Component"
})``;
const WrappedComponent = styled(Inner).withConfig({
    displayName: "WrappedComponent"
})``;
class ClassComponent {
    static Child = styled.div.withConfig({
        displayName: "Child"
    })``;
}
var GoodName = BadName = styled.div.withConfig({
    displayName: "GoodName"
})``;
