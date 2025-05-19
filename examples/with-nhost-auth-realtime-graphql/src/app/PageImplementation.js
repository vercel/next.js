"use client";

import { useUserData, useSignOut } from "@nhost/react";
import InsertItem from "./InsertItem";
import { useSubscription, useMutation, gql } from "@apollo/client";
import { useState } from "react";

// GraphQL Queries and Mutations (no change needed here, but good to keep them co-located or imported)
const S_GET_ITEMS = gql`
  subscription sGetItems {
    items {
      id
      name
    }
  }
`;

const DELETE_ITEM = gql`
  mutation deleteItem($item_id: uuid!) {
    delete_items_by_pk(id: $item_id) {
      id # Requesting id back confirms success
    }
  }
`;

function ListItems() {
  const {
    loading,
    error: subscriptionError,
    data,
  } = useSubscription(S_GET_ITEMS);
  const [deleteItemMutation, { loading: isDeleting, error: deleteError }] =
    useMutation(DELETE_ITEM, {
      // Optional: Update cache manually if needed, though subscriptions often handle this.
      // For instance, if you wanted to ensure the item is removed immediately:
      // update: (cache, { data: { delete_items_by_pk: deletedItem } }) => {
      //   if (!deletedItem) return;
      //   const existingItemsData = cache.readQuery({ query: S_GET_ITEMS });
      //   if (existingItemsData && existingItemsData.items) {
      //     cache.writeQuery({
      //       query: S_GET_ITEMS,
      //       data: {
      //         items: existingItemsData.items.filter(item => item.id !== deletedItem.id),
      //       },
      //     });
      //   }
      // }
      // Or more simply, refetch the subscription data (can cause a flicker):
      // refetchQueries: [{ query: S_GET_ITEMS }],
    });

  const [currentItemDeleting, setCurrentItemDeleting] = useState(null);

  async function handleDeleteItem(itemId) {
    setCurrentItemDeleting(itemId);
    try {
      await deleteItemMutation({
        // await the mutation
        variables: {
          item_id: itemId,
        },
      });
      // Success: Nhost subscription should update the list automatically.
      // You could add a success toast here if desired.
    } catch (err) {
      // This catch block is for network errors or if the promise itself rejects
      // outside of Apollo's error handling (less common for GraphQL errors).
      console.error("Error executing delete mutation:", err);
      alert("Error deleting item. Please check console.");
    } finally {
      setCurrentItemDeleting(null);
    }
  }

  if (loading && !data) {
    return <div>Loading items...</div>;
  }

  if (subscriptionError) {
    console.error("Error loading items:", subscriptionError);
    return <div>Error loading items. {subscriptionError.message}</div>;
  }

  if (deleteError) {
    // This handles GraphQL errors from the mutation
    // You might want to display this more gracefully, e.g., a toast notification
    console.error("Error from delete mutation:", deleteError);
    // alert(`Error deleting item: ${deleteError.message}`); // Avoid alert if possible
  }

  const items = data?.items || [];

  if (items.length === 0 && !loading) {
    return <div>No items found.</div>;
  }

  return (
    <div style={{ padding: "10px" }}>
      <h3>Items List</h3>
      {deleteError && (
        <p style={{ color: "red" }}>
          Could not delete item: {deleteError.message}
        </p>
      )}
      <ul>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              marginBottom: "5px",
              display: "flex",
              alignItems: "center",
            }}
          >
            {item.name}
            <button
              onClick={() => handleDeleteItem(item.id)}
              disabled={isDeleting && currentItemDeleting === item.id}
              style={{
                marginLeft: "10px",
                cursor: "pointer",
                color: "red",
                border: "1px solid red",
                background: "none",
                padding: "2px 5px",
              }}
              aria-label={`Delete item ${item.name}`}
            >
              {isDeleting && currentItemDeleting === item.id
                ? "Deleting..."
                : "Delete"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  // const nhostClient = useNhostClient(); // No longer needed directly for user/logout
  const userData = useUserData(); // Reactive user data
  const { signOut, isLoading: isSigningOut } = useSignOut(); // Hook for signing out

  const handleSignOut = async () => {
    await signOut();
    // router.push('/login') // Next.js router from 'next/navigation' would redirect automatically if PrivateRoute is effective
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "20px",
          padding: "10px",
          borderBottom: "1px solid #eee",
        }}
      >
        {userData ? (
          <pre>Welcome, {userData.displayName || userData.email}!</pre>
        ) : (
          <pre>Loading user...</pre>
        )}
        <div style={{ marginLeft: "auto" }}>
          {" "}
          {/* Pushes button to the right */}
          <button onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </div>
      <h1>Dashboard</h1>
      <InsertItem />
      <ListItems />
    </div>
  );
}
