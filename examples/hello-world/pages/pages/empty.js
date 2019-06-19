import styled from "styled-components";
import { Body2, Headline6 } from "@material/react-typography";

import "@material/react-typography/dist/typography.css";

import Icon from "../components/icon";

const Container = styled.div`
  height: calc(100vh - 104px);
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #5f6368;
  user-select: none;
`;

const StyledIcon = styled(Icon)`
  font-size: 50px;
  margin: 14px 0;
`;

const Header = styled(Headline6)`
  margin: 0;
`;

const Empty = ({ header, subtext, icon }) => (
  <Container>
    <StyledIcon icon={icon} />
    <Header>{header}</Header>
    <Body2>{subtext}</Body2>
  </Container>
);

export default Empty;
