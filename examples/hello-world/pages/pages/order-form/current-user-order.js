import { useState, useEffect } from "react";
import styled from "styled-components";

import Order from "../../components/order";
import { useFirebase } from "../../firebase";
import notify from "./../notify";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  padding: 16px;
  max-width: 768px;
  margin: 0 auto;

  h6,
  .mdc-list-item__primary-text {
    text-transform: capitalize;
  }
`;

const CurrentOrderScreen = ({ id, currentOrder }) => {
  const [queue, setQueue] = useState([]);
  const [position, setPosition] = useState(0);
  const { firebaseDB } = useFirebase();

  useEffect(() => {
    const unsub = listener();
    return unsub;
  }, []);

  const listener = () =>
    firebaseDB
      .collection("orders")
      .where("status", "==", "ordered")
      .orderBy("time_ordered", "asc")
      .onSnapshot(querySnapshot => {
        const formattedOrders = querySnapshot.docs.map((doc, i) => {
          const data = doc.data();
          if (doc.id === id) setPosition(i + 1);
          return {
            ...data,
            id: doc.id,
            time_ordered: data.time_ordered.toDate()
          };
        });
        setQueue(formattedOrders);
      });

  const onCancel = async ({ id }) => {
    try {
      await firebaseDB
        .collection("orders")
        .doc(id)
        .update({
          status: "cancelled"
        });
    } catch (e) {
      notify({
        message: "Couldn't cancel order. Please try again.",
        toastId: "cancel-order-error",
        action: "Retry",
        onActionClick: () => {
          onCancel({ id });
        }
      });
      console.log(e);
    }
  };

  return (
    <Container>
      <Order
        order={{ id, ...currentOrder }}
        bodyString={`Currently ${position}/${queue.length} in line`}
        action="Cancel"
        extraOnClick={onCancel}
      />
    </Container>
  );
};

export default CurrentOrderScreen;
