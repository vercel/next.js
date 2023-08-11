"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/acl";
import useFetch from "@/lib/fetcher";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Else, If, Then } from "react-if";
import { toast } from "sonner";

const initialText =
  "Simplify Access Control with iamjs: Your Comprehensive Library for Effortless Authorization in Both Node.js and Browser Environments.";

export default function Role() {
  const router = useRouter();
  const params = useParams();
  const { build } = useAuth();
  const [text, setText] = useState<string>(initialText);

  const { loading, data } = useFetch("/api/" + params.role);
  const { Show, can } = build(data);

  const canIUpdate = async () => {
    const res = await fetch("/api/cani", {
      method: "PUT",
      body: JSON.stringify({
        role: params.role,
      }),
    });
    if (res.ok) {
      toast.success("You can update this post.");
    } else {
      toast.error("You can't update this post.");
    }
  };

  const canIDelete = async () => {
    const res = await fetch("/api/cani", {
      method: "DELETE",
      body: JSON.stringify({
        role: params.role,
      }),
    });
    if (res.ok) {
      toast.success("You can delete this post.");
    } else {
      toast.error("You can't delete this post.");
    }
  };

  return (
    <div className="flex flex-col w-full gap-2 justify-center items-center min-h-screen">
      <Button
        onClick={() => router.push("/")}
        variant="secondary"
        size="icon"
        className="absolute top-0 left-0 mt-28 mx-56 z-20 flex justify-center items-center rounded-full p-1 h-10 w-10 cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="#000"
          className="w-6 h-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
          />
        </svg>
      </Button>
      <Card className="flex flex-col gap-4 p-8">
        <If condition={loading}>
          <Then>
            <Skeleton className="w-96 h-36" />
            <div className="w-96 flex justify-end items-center py-2 gap-2">
              <Skeleton className="w-24 h-10" />
              <Skeleton className="w-24 h-10" />
            </div>
            <div className="w-96 flex flex-col justify-start items-center gap-2">
              <Skeleton className="w-96 h-10" />
              <Skeleton className="w-96 h-10" />
            </div>
          </Then>
          <Else>
            <Textarea
              className="w-96 h-36"
              placeholder="Type your message here."
              disabled={!can("posts", ["create", "update"])}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
            />
            <div className="w-96 flex justify-end items-center py-2 gap-2">
              <Show resources="posts" actions="update">
                <Button>Update</Button>
              </Show>
              <Show resources="posts" actions="delete">
                <Button variant="destructive">Delete</Button>
              </Show>
            </div>
            <div className="w-96 flex flex-col justify-center items-start gap-2">
              <p className="text-black/75 text-sm">
                Check if you can do something
              </p>
              <Button className="w-full" onClick={canIUpdate}>
                Check if you can update
              </Button>
              <Button className="w-full" onClick={canIDelete}>
                Check if you can delete
              </Button>
            </div>
          </Else>
        </If>
      </Card>
    </div>
  );
}
