import { useEffect, useRef } from "react";
import Router from "next/router";
import { useUser } from "../lib/hooks";

function ProfileEdit() {
  const [user, { mutate }] = useUser();
  const nameRef = useRef();

  useEffect(() => {
    if (!user) return;
    nameRef.current.value = user.name;
  }, [user]);

  async function handleEditProfile(e) {
    e.preventDefault();

    const body = {
      name: nameRef.current.value,
    };
    const res = await fetch(`/api/user`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const updatedUser = await res.json();

    mutate(updatedUser);
  }

  async function handleDeleteProfile() {
    const res = await fetch(`/api/user`, {
      method: "DELETE",
    });

    if (res.status === 204) {
      mutate({ user: null });
      Router.replace("/");
    }
  }

  return (
    <>
      <div className="form-container">
        <form onSubmit={handleEditProfile}>
          <label>
            <span>Name</span>
            <input type="text" ref={nameRef} required />
          </label>
          <div className="submit">
            <button type="submit">Update profile</button>
            <a role="button" className="delete" onClick={handleDeleteProfile}>
              Delete profile
            </a>
          </div>
        </form>
      </div>
      <style jsx>{`
        .delete {
          color: #f44336;
          cursor: pointer;
        }
        .delete:hover {
          color: #b71c1c;
        }
      `}</style>
    </>
  );
}

export default function ProfilePage() {
  const [user, { loading }] = useUser();

  useEffect(() => {
    // redirect user to login if not authenticated
    if (!loading && !user) Router.replace("/login");
  }, [user, loading]);

  return (
    <>
      <h1>Profile</h1>

      {user && (
        <>
          <p>Your session:</p>
          <pre>{JSON.stringify(user, null, 2)}</pre>
          <ProfileEdit />
        </>
      )}

      <style jsx>{`
        pre {
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      `}</style>
    </>
  );
}
