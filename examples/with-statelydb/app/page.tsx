import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fetchChannels, fetchShowsByChannel } from "@/lib/actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const channels = await fetchChannels();

  if (channels.length === 0) {
    // No data yet – kick off bootstrap flow
    redirect("/admin/bootstrap");
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-b from-primary/20 to-background border-b border-border/40">
        <div className="container py-12 px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-5xl font-bold mb-3 tracking-tight">Browse Channels</h1>
              <p className="text-lg text-muted-foreground">
                Discover shows and characters across all channels
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Channels Grid */}
      <div className="container py-10 px-4">
        <div className="space-y-8">
          {channels.map((channel) => (
            <ChannelSection key={channel.id} channel={channel} channelIdStr={channel.id} />
          ))}
        </div>
      </div>
    </div>
  );
}

async function ChannelSection({
  channel,
  channelIdStr,
}: {
  channel: { name: string; description: string };
  channelIdStr: string;
}) {
  const shows = await fetchShowsByChannel(channelIdStr);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{channel.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{channel.description}</p>
        </div>
        <Link href={`/channels/${channelIdStr}`}>
          <Button variant="ghost" size="sm">
            View All →
          </Button>
        </Link>
      </div>
      <div className="relative">
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
          {shows.slice(0, 6).map((show) => (
            <Link
              key={show.id}
              href={`/channels/${channelIdStr}/shows/${show.id}`}
              className="flex-none w-64 snap-start block"
            >
              <div className="bg-card border border-border rounded-lg p-4 h-full transition-all duration-200 hover:border-primary hover:shadow-lg hover:shadow-primary/20 cursor-pointer">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg line-clamp-1">{show.title}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    {show.year}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{show.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
