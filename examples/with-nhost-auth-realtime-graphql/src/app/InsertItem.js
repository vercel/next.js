"use client";

import { useState } from "react";
import { useMutation, gql } from "@apollo/client";

const INSERT_ITEM = gql`
  mutation insertItem($item: items_insert_input!) {
    insert_items_one(object: $item) {
      id
    }
  }
`;

export default function InsertItem() {
  const [name, setName] = useState("");
  const [insertItem] = useMutation(INSERT_ITEM);

  async function handleFormSubmit(e) {
    e.preventDefault();
    try {
      insertItem({
        variables: {
          item: {
            name,
          },
        },
      });
    } catch (error) {
      console.error(error);
      return alert("Error inserting item");
    }

    setName("");
  }

  return (
    <div style={{ padding: "10px" }}>
      <form onSubmit={handleFormSubmit}>
        <div>
          <input
            type="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <button type="submit">Insert item</button>
        </div>
      </form>
    </div>
  );
}
