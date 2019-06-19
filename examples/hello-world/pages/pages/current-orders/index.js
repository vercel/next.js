import { useState, useEffect } from "react";
import { distanceInWordsToNow } from "date-fns";
import { useTransition, animated } from "react-spring";
import styled from "styled-components";

import Layout, { LayoutRow, LayoutFluidCell } from "./../../components/layout";
import AdminOrder from "./../../components/admin-order";
import { useFirebase } from "../../firebase";
import notify from "../notify";
import Empty from "../empty";
import Swipe from "../../components/swipe";
import { lookupEmail, getChannel, dm } from "./slack-utils";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 768px;
  margin: 0 auto;

  & > .mdc-layout-grid {
    width: 100%;
  }
`;

const CurrentOrders = () => {
  const [orders, setOrders] = useState([]);
  const { firebaseDB } = useFirebase();

  useEffect(() => {
    const unsub = listener();
    return unsub;
  }, []);

  const transitions = useTransition(orders, item => `current-${item.id}`, {
    from: { maxHeight: 0, overflow: "hidden" },
    enter: { maxHeight: 999, overflow: "hidden" },
    leave: { maxHeight: 0, overflow: "hidden" }
  });

  const listener = () =>
    firebaseDB
      .collection("orders")
      .where("status", "==", "ordered")
      .orderBy("time_ordered", "asc")
      .onSnapshot(querySnapshot => {
        const formattedOrders = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            time_ordered: data.time_ordered.toDate()
          };
        });
        setOrders(formattedOrders);
      });

  const onComplete = async ({ id, name, email, ...rest }) => {
    try {
      await firebaseDB
        .collection("orders")
        .doc(id)
        .update({
          status: "done"
        });
      const { userId, displayName } = await lookupEmail(email);
      const channelId = await getChannel(userId);
      const status = await dm(
        channelId,
        `Hey ${displayName}, your ${rest.options.coffee} is ready!`
      );
      if (!status) {
        notify({
          message: "Couldn't message user. Please try again.",
          toastId: "complete-slack-error"
        });
      }
    } catch (e) {
      notify({
        message: "Couldn't mark order completed. Please try again.",
        toastId: "complete-order-error",
        action: "Retry",
        onActionClick: () => {
          onComplete({ id });
        }
      });
      console.log(e);
    }
  };

  return (
    <Container>
      {orders.length ? (
        <Layout>
          {transitions.map(
            ({ item: { time_ordered, name, ...rest }, props, key }, i) => (
              <animated.div key={key} style={props}>
                <LayoutRow>
                  <LayoutFluidCell>
                    <Swipe data={{ name, ...rest }} swipeAction={onComplete}>
                      <AdminOrder
                        order={{ name, ...rest }}
                        bodyString={`Ordered ${distanceInWordsToNow(
                          new Date(time_ordered),
                          {
                            includeSeconds: true
                          }
                        )} by ${name}`}
                        action="Complete"
                        extraOnClick={onComplete}
                        opened={i === 0}
                      />
                    </Swipe>
                  </LayoutFluidCell>
                </LayoutRow>
              </animated.div>
            )
          )}
        </Layout>
      ) : (
        <Empty
          header="Congratulations!"
          subtext="No orders left!"
          icon="mood"
        />
      )}
    </Container>
  );
};

export default CurrentOrders;
