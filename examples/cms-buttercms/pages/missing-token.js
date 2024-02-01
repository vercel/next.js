import MissingTokenSection from "@/components/missing-token-section";

export default function MissingToken() {
  return <MissingTokenSection />;
}

export async function getStaticProps() {
  return {
    props: {},
  };
}
