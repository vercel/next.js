import { GoogleMapsEmbed } from "@next/third-parties/google";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

export default function Page() {
  return (
    <div>
      <GoogleMapsEmbed
        apiKey={API_KEY}
        height={400}
        width={700}
        mode="place"
        q="Brooklyn+Bridge,New+York,NY"
      />
    </div>
  );
}
