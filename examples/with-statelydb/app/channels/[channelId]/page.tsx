import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShowCard } from "@/components/features/ShowCard";
import { EmptyState } from "@/components/features/EmptyState";
import { fetchChannel, fetchShowsByChannel } from "@/lib/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  const channel = await fetchChannel(channelId);

  if (!channel) {
    notFound();
  }

  const shows = await fetchShowsByChannel(channelId);

  return (
    <div className="container py-8 px-4">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Channels
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">{channel.name}</h1>
          <p className="text-lg text-muted-foreground">{channel.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Shows</h2>
      </div>

      {shows.length === 0 ? (
        <EmptyState
          title="No Shows Available"
          description="This channel doesn't have any shows yet"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {shows.map((show) => (
            <ShowCard key={show.id} show={show} channelId={channelId} />
          ))}
        </div>
      )}
    </div>
  );
}
