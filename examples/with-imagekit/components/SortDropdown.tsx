import { SortDirectionEnum, SortEnum, SortLabelEnum } from "@/utils/enum";
import Link from "next/link";
import { useEffect, useState } from "react";
import SortIcon from "./Icons/SortIcon";
import { SortDirectionType, SortType } from "@/utils/types";

const SortDropdown = ({
  sortParam,
  sortDirectionParam,
}: {
  sortParam?: SortType;
  sortDirectionParam?: SortDirectionType;
}) => {
  const [sortValue, setSortValue] = useState(SortEnum.CREATED);
  const [sortDirection, setSortDirection] = useState(SortDirectionEnum.DESC);
  const [openSortDropdown, setOpenSortDropDown] = useState(false);
  useEffect(() => {
    setSortValue(sortParam || SortEnum.CREATED);
    setSortDirection(sortDirectionParam || SortDirectionEnum.DESC);
  }, [sortParam, sortDirectionParam]);
  return (
    <div className="flex gap-4">
      <div className="relative inline-block text-left">
        <div>
          <button
            type="button"
            className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-black b-white/75 px-3 py-2 text-sm text-white/75 shadow-sm ring-1 ring-inset ring-gray-300"
            id="menu-button"
            aria-expanded="true"
            aria-haspopup="true"
            onClick={() => setOpenSortDropDown((prev) => !prev)}
          >
            {SortLabelEnum[sortValue]}
            <svg
              className="-mr-1 h-5 w-5 text-white/75"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {openSortDropdown && (
          <div
            className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            role="menu"
            aria-orientation="vertical"
            aria-labelledby="menu-button"
          >
            <div className="py-1" role="none">
              <Link
                href={`/?sort=${SortEnum.CREATED}&sortDirection=${sortDirection}`}
                className="block px-4 py-2 text-sm text-gray-700"
                role="menuitem"
                id="menu-item-0"
                onClick={() => setOpenSortDropDown((prev) => !prev)}
              >
                {SortLabelEnum.CREATED}
              </Link>
              <Link
                href={`/?sort=${SortEnum.UPDATED}&sortDirection=${sortDirection}`}
                className="block px-4 py-2 text-sm text-gray-700"
                role="menuitem"
                id="menu-item-0"
                onClick={() => setOpenSortDropDown((prev) => !prev)}
              >
                {SortLabelEnum.UPDATED}
              </Link>
              <Link
                href={`/?sort=${SortEnum.NAME}&sortDirection=${sortDirection}`}
                className="block px-4 py-2 text-sm text-gray-700"
                role="menuitem"
                id="menu-item-0"
                onClick={() => setOpenSortDropDown((prev) => !prev)}
              >
                {SortLabelEnum.NAME}
              </Link>
              <Link
                href={`/?sort=${SortEnum.HEIGHT}&sortDirection=${sortDirection}`}
                className="block px-4 py-2 text-sm text-gray-700"
                role="menuitem"
                id="menu-item-0"
                onClick={() => setOpenSortDropDown((prev) => !prev)}
              >
                {SortLabelEnum.HEIGHT}
              </Link>
              <Link
                href={`/?sort=${SortEnum.WIDTH}&sortDirection=${sortDirection}`}
                className="block px-4 py-2 text-sm text-gray-700"
                role="menuitem"
                id="menu-item-0"
                onClick={() => setOpenSortDropDown((prev) => !prev)}
              >
                {SortLabelEnum.WIDTH}
              </Link>
              <Link
                href={`/?sort=${SortEnum.SIZE}&sortDirection=${sortDirection}`}
                className="block px-4 py-2 text-sm text-gray-700"
                role="menuitem"
                id="menu-item-0"
                onClick={() => setOpenSortDropDown((prev) => !prev)}
              >
                {SortLabelEnum.SIZE}
              </Link>
              <Link
                href={`/?sort=${SortEnum.RELEVANCE}&sortDirection=${sortDirection}`}
                className="block px-4 py-2 text-sm text-gray-700"
                role="menuitem"
                id="menu-item-0"
                onClick={() => setOpenSortDropDown((prev) => !prev)}
              >
                {SortLabelEnum.RELEVANCE}
              </Link>
            </div>
          </div>
        )}
      </div>
      <div>
        <Link
          type="button"
          className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-black b-white/75 px-3 py-2 text-sm text-white/75 shadow-sm ring-1 ring-inset ring-gray-300"
          id="menu-button"
          aria-expanded="true"
          aria-haspopup="true"
          href={`/?sort=${sortValue}&sortDirection=${
            sortDirection === SortDirectionEnum.ASC
              ? SortDirectionEnum.DESC
              : SortDirectionEnum.ASC
          }`}
        >
          <SortIcon direction={sortDirection} />
        </Link>
      </div>
    </div>
  );
};

export default SortDropdown;
