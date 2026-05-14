import { generateContent } from "@/lib/api-client";

export default async function Home() {
  // Example: Generate ad copy using AI
  let adCopy = "";
  try {
    const result = await generateContent({
      prompt: "Write a compelling ad for a luxury watch brand",
      type: "ad-copy",
      tone: "persuasive",
      maxLength: 100,
    });
    adCopy = result.content;
  } catch (error) {
    console.error("Failed to generate content:", error);
    adCopy = "Failed to generate ad copy. Check your API configuration.";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">
            Ad Platform Integration Demo
          </h1>
          <p className="text-gray-600 mb-8">
            Unified API client for AI content, Google Ads, Meta Ads, and Stripe
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-3">🤖 AI Content</h2>
            <p className="text-gray-600 mb-4">
              Generate marketing content with AI
            </p>
            <div className="bg-gray-50 p-4 rounded">
              <p className="text-sm italic">{adCopy}</p>
            </div>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-3">📢 Google Ads</h2>
            <p className="text-gray-600 mb-4">
              Manage Google Ads campaigns programmatically
            </p>
            <code className="text-sm bg-gray-50 p-2 block rounded">
              googleAds.getCampaigns()
            </code>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-3">📱 Meta Ads</h2>
            <p className="text-gray-600 mb-4">
              Create and manage Facebook/Instagram ads
            </p>
            <code className="text-sm bg-gray-50 p-2 block rounded">
              metaAds.createCampaign()
            </code>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-3">💳 Stripe</h2>
            <p className="text-gray-600 mb-4">
              Process payments and subscriptions
            </p>
            <code className="text-sm bg-gray-50 p-2 block rounded">
              stripe.createCheckout()
            </code>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold mb-2">Quick Start</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Copy <code className="bg-white px-1">.env.example</code> to <code className="bg-white px-1">.env.local</code></li>
            <li>Add your API keys for the services you want to use</li>
            <li>See <code className="bg-white px-1">README.md</code> for detailed setup instructions</li>
          </ol>
        </div>
      </div>
    </main>
  );
}
