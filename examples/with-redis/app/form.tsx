"use client";

import clsx from "clsx";
import { useOptimistic, useRef, useTransition } from "react";
import { saveFeature, upvote } from "./actions";
import { v4 as uuidv4 } from "uuid";
import { Feature } from "./types";

function Item({
  isFirst,
  isLast,
  isReleased,
  hasVoted,
  feature,
  pending,
  mutate,
}: {
  isFirst: boolean;
  isLast: boolean;
  isReleased: boolean;
  hasVoted: boolean;
  feature: Feature;
  pending: boolean;
  mutate: any;
}) {
  let upvoteWithId = upvote.bind(null, feature);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let [isPending, startTransition] = useTransition();

  return (
    <form
      action={upvoteWithId}
      onSubmit={(event) => {
        event.preventDefault();

        startTransition(async () => {
          mutate({
            updatedFeature: {
              ...feature,
              score: Number(feature.score) + 1,
            },
            pending: true,
          });
          await upvote(feature);
        });
      }}
      className={clsx(
        "p-6 mx-8 flex items-center border-t border-l border-r",
        isFirst && "rounded-t-md",
        isLast && "border-b rounded-b-md",
      )}
    >
      <button
        className={clsx(
          "ring-1 ring-gray-200 rounded-full w-8 min-w-[2rem] h-8 mr-4 focus:outline-none focus:ring focus:ring-blue-300",
          (isReleased || hasVoted) &&
            "bg-green-100 cursor-not-allowed ring-green-300",
          pending && "bg-gray-100 cursor-not-allowed",
        )}
        disabled={isReleased || hasVoted || pending}
        type="submit"
      >
        {isReleased ? "✅" : "👍"}
      </button>
      <h3 className="text font-semibold w-full text-left">{feature.title}</h3>
      <div className="bg-gray-200 text-gray-700 text-sm rounded-xl px-2 ml-2">
        {feature.score}
      </div>
    </form>
  );
}

type FeatureState = {
  newFeature: Feature;
  updatedFeature?: Feature;
  pending: boolean;
};

export default function FeatureForm({ features }: { features: Feature[] }) {
  let formRef = useRef<HTMLFormElement>(null);
  let [state, mutate] = useOptimistic(
    { features, pending: false },
    function createReducer(state, newState: FeatureState) {
      if (newState.newFeature) {
        return {
          features: [...state.features, newState.newFeature],
          pending: newState.pending,
        };
      } else {
        return {
          features: [
            ...state.features.filter(
              (f) => f.id !== newState.updatedFeature!.id,
            ),
            newState.updatedFeature,
          ] as Feature[],
          pending: newState.pending,
        };
      }
    },
  );

  let sortedFeatures = state.features.sort((a, b) => {
    // First, compare by score in descending order
    if (Number(a.score) > Number(b.score)) return -1;
    if (Number(a.score) < Number(b.score)) return 1;

    // If scores are equal, then sort by created_at in ascending order
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  let featureStub = {
    id: uuidv4(),
    title: "", // will used value from form
    created_at: new Date().toISOString(),
    score: "1",
  };
  let saveWithNewFeature = saveFeature.bind(null, featureStub);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let [isPending, startTransition] = useTransition();

  return (
    <>
      <div className="mx-8 w-full">
        <form
          className="relative my-8"
          ref={formRef}
          action={saveWithNewFeature}
          onSubmit={(event) => {
            event.preventDefault();
            let formData = new FormData(event.currentTarget);
            let newFeature = {
              ...featureStub,
              title: formData.get("feature") as string,
            };

            formRef.current?.reset();
            startTransition(async () => {
              mutate({
                newFeature,
                pending: true,
              });

              await saveFeature(newFeature, formData);
            });
          }}
        >
          <input
            aria-label="Suggest a feature for our roadmap"
            className="pl-3 pr-28 py-3 mt-1 text-lg block w-full border border-gray-200 rounded-md text-gray-900 placeholder-gray-400 focus:outline-none focus:ring focus:ring-blue-300"
            maxLength={150}
            placeholder="I want..."
            required
            type="text"
            name="feature"
            disabled={state.pending}
          />
          <button
            className={clsx(
              "flex items-center justify-center absolute right-2 top-2 px-4 h-10 text-lg border bg-black text-white rounded-md w-24 focus:outline-none focus:ring focus:ring-blue-300 focus:bg-gray-800",
              state.pending && "bg-gray-700 cursor-not-allowed",
            )}
            type="submit"
            disabled={state.pending}
          >
            Request
          </button>
        </form>
      </div>
      <div className="w-full">
        {sortedFeatures.map((feature: any, index: number) => (
          <Item
            key={feature.id}
            isFirst={index === 0}
            isLast={index === sortedFeatures.length - 1}
            isReleased={false}
            hasVoted={false}
            feature={feature}
            pending={state.pending}
            mutate={mutate}
          />
        ))}
      </div>
    </>
  );
}
