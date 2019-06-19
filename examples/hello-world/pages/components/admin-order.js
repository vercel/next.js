import styled from "styled-components";
import Card, { CardPrimaryContent, CardActions } from "@material/react-card";
import List, { ListItem, ListItemText } from "@material/react-list";
import { Body2, Headline6 } from "@material/react-typography";

import "@material/react-typography/dist/typography.css";
import "@material/react-list/dist/list.css";
import "@material/react-card/dist/card.css";

import Button from "./button";

const AnimatedList = styled(List)`
  transition: max-height 0.3s ease-out, padding 0.3s ease-out;

  max-height: ${({ open }) => (open ? "500px" : 0)};
  padding: ${({ open }) => (open ? "8px 0" : "0 0")};
`;

const OrderHeader = styled(CardPrimaryContent)`
  padding: 16px;
`;

const OrderTitle = styled(Headline6)`
  margin: 0;
`;

const PageOrder = styled(Card)`
  h6,
  .mdc-typography.mdc-typography--body2,
  .mdc-list-item__text {
    text-transform: capitalize;
  }
`;

const Order = ({
  order: {
    id,
    options: { coffee, ...rest },
    name
  },
  bodyString,
  action,
  extraOnClick,
  opened
}) => {
  const onClick = () => {
    if (extraOnClick) extraOnClick({ id, name, options: { coffee, ...rest } });
  };

  return (
    <PageOrder outlined>
      <OrderHeader>
        <OrderTitle>{coffee}</OrderTitle>
        <Body2>{bodyString}</Body2>
      </OrderHeader>

      <CardPrimaryContent>
        <AnimatedList twoLine open={opened}>
          {Object.entries(rest).map(([key, value], i) => (
            <ListItem key={`${coffee}-${value}-${i}`}>
              <ListItemText primaryText={value} secondaryText={key} />
            </ListItem>
          ))}
        </AnimatedList>
      </CardPrimaryContent>

      <CardActions>
        {action && <Button onClick={onClick}>{action}</Button>}
      </CardActions>
    </PageOrder>
  );
};

export default Order;
