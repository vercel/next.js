export default function IndexPage() {
  return (
    <div>
      should be blue.
      <style jsx global>{`
        :global(div) {
          color: blue;
        }
      `}</style>
    </div>
  );
}
