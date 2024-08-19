export function Input({ ...props }: React.JSX.IntrinsicElements["input"]) {
  return (
    <input
      className="rounded-md h-8 text-sm px-4 py-2 bg-inherit border"
      {...props}
    />
  );
}
