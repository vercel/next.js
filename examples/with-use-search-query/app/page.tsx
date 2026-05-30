"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSearchQuery } from "use-search-query";

export default function Home() {
  const searchParams = useSearchParams();

  const pathname = usePathname();

  const pageQuery = searchParams.get("page");
  const nameQuery = searchParams.get("name");
  const surnameQuery = searchParams.get("surname");

  const page =
    pageQuery && !isNaN(parseInt(pageQuery)) ? parseInt(pageQuery) : 1;

  const router = useRouter();

  const { routeToSearchParams, setSearchParams } = useSearchQuery();

  const [nameSearchTerm, setNameSearchTerm] = useState<string>("");
  const [surnameSearchTerm, setSurnameSearchTerm] = useState<string>("");

  return (
    <div className="flex flex-col gap-6 container mx-auto my-10">
      <div className="flex flex-col gap-2">
        <label>You are looking for:</label>
        <label>
          <b>Name:</b>
          {nameQuery}
        </label>
        <label>
          <b>Surname:</b>
          {surnameQuery}
        </label>
        <label>You are at page: {page}</label>
      </div>
      <hr />
      <div className="flex flex-row items-start container mx-auto my-10">
        <div className="flex flex-col gap-4 p-4 flex-1 h-full">
          <label>With routeToSearchParams hook</label>
          <hr />
          <input
            value={nameSearchTerm}
            onChange={(e) => {
              setNameSearchTerm(e.target.value);
            }}
            placeholder="Type a name for search..."
            className="border rounded-md px-2"
          />
          <button
            className="border rounded-md"
            onClick={() => {
              routeToSearchParams(pathname, { name: nameSearchTerm });
            }}
          >
            Search
          </button>
        </div>
        <div className="flex flex-col gap-4 p-4 flex-1">
          <label>With setSearchParams hook</label>
          <hr />
          <input
            value={surnameSearchTerm}
            onChange={(e) => {
              setSurnameSearchTerm(e.target.value);
            }}
            placeholder="Type a name for search..."
            className="border rounded-md px-2"
          />
          <button
            className="border rounded-md"
            onClick={() => {
              const newSearchParams = setSearchParams({
                surname: surnameSearchTerm,
              });
              router.replace(`/?${newSearchParams}`);
            }}
          >
            Search
          </button>
        </div>
      </div>

      <hr />
      <div className="flex flex-row items-center gap-4 mx-auto">
        <button
          className="border rounded-md p-2"
          onClick={() => {
            // If reset true removes existing search params and adding new parameters from the updates object.
            routeToSearchParams(
              pathname,
              { name: nameSearchTerm, surname: surnameSearchTerm },
              { reset: true },
            );
          }}
        >
          Go To First Page
        </button>
        <button
          className="border rounded-md p-2"
          onClick={() => {
            routeToSearchParams(pathname, { page: page - 1 });
          }}
        >
          Previous Page
        </button>
        <label>{page}</label>
        <button
          className="border rounded-md p-2"
          onClick={() => {
            routeToSearchParams(pathname, { page: page + 1 });
          }}
        >
          Next Page
        </button>
        <button
          className="border rounded-md p-2"
          onClick={() => {
            routeToSearchParams(pathname, {
              name: nameSearchTerm,
              surname: surnameSearchTerm,
              page: 999,
            });
          }}
        >
          Go To Last Page
        </button>
      </div>
    </div>
  );
}
