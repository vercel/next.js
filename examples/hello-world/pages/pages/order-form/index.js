import { useState, useEffect } from "react";
import { useTransition, animated, useSpring } from "react-spring";
import styled from "styled-components";

import FormBuilder from "./../form-builder";
import schema from "./schema";

import { useFirebase } from "./../../firebase";
import { useAuthState } from "../../session";
import CurrentUserOrder from "./current-user-order";
import Button from "./../../components/button";
import notify from "../notify";

const AnimeOrderAgainContainer = styled(animated.div)`
  display: flex;
  width: 100%;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
`;

const AnimeFormContainer = styled(animated.div)`
  overflow: hidden;
`;

const OrderForm = () => {
  const [currentOrders, setCurrentOrders] = useState([]);
  const [openedForm, setOpenedForm] = useState(true);
  const { firebaseDB, firebaseApp } = useFirebase();
  const { authUser } = useAuthState();

  const formStyleProps = useSpring({
    maxHeight: openedForm ? 999 : 0,
    opacity: openedForm ? 1 : 0
  });
  const buttonStyleProps = useSpring({ opacity: openedForm ? 0 : 1 });

  const transitions = useTransition(
    currentOrders,
    item => `current-${item.id}`,
    {
      from: { maxHeight: 0, overflow: "hidden" },
      enter: { maxHeight: 999, overflow: "hidden" },
      leave: { maxHeight: 0, overflow: "hidden" }
    }
  );

  useEffect(() => {
    const unsub = listener();
    return unsub;
  }, []);

  const listener = () =>
    firebaseDB
      .collection("orders")
      .where(
        "user",
        "==",
        firebaseDB.collection("users").doc(`${authUser.uid}`)
      )
      .where("status", "==", "ordered")
      .orderBy("time_ordered", "asc")
      .onSnapshot(querySnapshot => {
        const orders = querySnapshot.docs.map(doc => {
          const order = doc.data();
          return {
            ...order,
            id: doc.id,
            time_ordered: order.time_ordered.toDate()
          };
        });
        setCurrentOrders(orders);
      });

  const onSubmit = async options => {
    try {
      await firebaseDB.collection("orders").add({
        name: authUser.displayName,
        status: "ordered",
        options,
        user: firebaseDB.collection("users").doc(`${authUser.uid}`),
        email: authUser.email,
        time_ordered: firebaseApp.firestore.Timestamp.fromDate(new Date()),
        fav: false
      });
      setOpenedForm(false);
    } catch (e) {
      notify({
        message: "Couldn't place order. Please try again.",
        toastId: "order-error"
      });
      console.log(e);
    }
  };

  const onOpenForm = () => {
    setOpenedForm(true);
  };

  return (
    <>
      {transitions.map(({ item: { id, ...rest }, props, key }) => (
        <animated.div key={key} style={props}>
          <CurrentUserOrder id={id} currentOrder={rest} />
        </animated.div>
      ))}
      <AnimeFormContainer style={formStyleProps}>
        <FormBuilder schema={schema} onSubmit={onSubmit} />
      </AnimeFormContainer>
      <AnimeOrderAgainContainer style={buttonStyleProps}>
        <Button onClick={onOpenForm}>Order Again</Button>
      </AnimeOrderAgainContainer>
    </>
  );
};

export default OrderForm;
