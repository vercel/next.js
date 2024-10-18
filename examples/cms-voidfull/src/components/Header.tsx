import { MoveUpRightIcon } from "lucide-react";
import { cn } from "@codecarrot/essentials";

export function Header() {
  return (
    <div className={cn("max-w-6xl mx-auto px-4", "border-b border-gray-200")}>
      <div className="py-4 lg:py-8">
        <header className="flex justify-between items-center">
          <div>
            <a
              href="/"
              className="pointer-events-none flex place-items-center gap-2 p-8 lg:pointer-events-auto lg:p-0"
            >
              <img
                src="/voidfull.svg"
                aria-hidden="true"
                alt="voidfull logo"
                width={32}
                height={32}
                loading="lazy"
                decoding="async"
              />
              <span className="sr-only">Voidfull</span>
              <p className="text-xl font-semibold">Blog</p>
            </a>
          </div>

          <nav>
            <ul>
              <li>
                <a
                  href="https://voidfull.com?utm_source=template&utm_medium=header&utm_campaign=cms-voidfull"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center justify-between",
                    "space-x-1",
                    "rounded-lg px-2.5 py-1",
                    "hover:bg-white/25 focus:bg-white/25 focus:outline-none",
                  )}
                >
                  <span className={cn("font-medium text-sm")}>
                    go to homepage
                  </span>
                  <MoveUpRightIcon
                    className={cn("size-4")}
                    aria-hidden={true}
                  />
                </a>
              </li>
            </ul>
          </nav>
        </header>
      </div>
    </div>
  );
}
