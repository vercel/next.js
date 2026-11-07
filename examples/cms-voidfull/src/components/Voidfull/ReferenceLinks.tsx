import { cn } from "@codecarrot/essentials";

interface ItemProps {
  title: string;
  description?: string;
  href: string;
}

function Item(props: ItemProps) {
  return (
    <a
      href={props.href}
      className={cn(
        "group rounded-lg border border-transparent px-3 py-2 transition-colors",
        "hover:border-gray-300 hover:bg-gray-100",
      )}
      target="_blank"
      rel="noopener noreferrer"
    >
      <h2 className="text-xl font-semibold">
        {props.title}{" "}
        <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
          -&gt;
        </span>
      </h2>
      {props.description ? (
        <p className="mt-1 text-sm text-gray-500">{props.description}</p>
      ) : null}
    </a>
  );
}

export function ReferenceLinks() {
  return (
    <div className={cn("grid pl-12")}>
      <Item
        href="https://voidfull.com"
        title="Learn"
        description="Learn about Voidfull features."
      />

      <Item
        href="https://github.com/voidfull-templates"
        title="Templates"
        description="Explore starter templates for Voidfull."
      />
    </div>
  );
}
