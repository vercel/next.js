import styled from 'styled-components';
const Test1 = styled.div.withConfig({
  displayName: "code__Test1",
  componentId: "sc-kc0mjf-0"
})(["width:100%;"]);
const Test2 = styled.div.withConfig({
  displayName: "code__Test2",
  componentId: "sc-kc0mjf-1"
})(["width:100%;"]);
const Test3 = styled.div.withConfig({
  displayName: "code__Test3",
  componentId: "sc-kc0mjf-2"
})(["width:100%;", ";"], 'red');
const Test4 = styled.div.withConfig({
  displayName: "code__Test4",
  componentId: "sc-kc0mjf-3"
})(["width:100%;"]);
const Test5 = styled.div.withConfig({
  displayName: "code__Test5",
  componentId: "sc-kc0mjf-4"
})(["width:100%;"]);
const Test6 = styled.div.withConfig({
  displayName: "code__Test6",
  componentId: "sc-kc0mjf-5"
})(["background:url(\"https://google.com\");width:100%;", " "], 'green');
const Test7 = styled.div.withConfig({
  displayName: "code__Test7",
  componentId: "sc-kc0mjf-6"
})(["background:url(\"https://google.com\");width:", ";", "  height:", ";"], p => p.props.width, 'green', p => p.props.height);
