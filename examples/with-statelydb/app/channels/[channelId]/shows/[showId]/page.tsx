import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CharacterCard } from "@/components/features/CharacterCard";
import { EmptyState } from "@/components/features/EmptyState";
import { fetchShow, fetchCharactersByShow } from "@/lib/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShowPage({
  params,
}: {
  params: Promise<{ channelId: string; showId: string }>;
}) {
  const { channelId, showId } = await params;
  const show = await fetchShow(channelId, showId);

  if (!show) {
    notFound();
  }

  const characters = await fetchCharactersByShow(channelId, showId);

  return (
    <div className="container py-8 px-4">
      <div className="mb-6">
        <Link href={`/channels/${channelId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Channel
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">{show.title}</h1>
          <p className="text-lg text-muted-foreground mb-2">{show.year}</p>
          <p className="text-base text-foreground/80 max-w-3xl">{show.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Characters</h2>
      </div>

      {characters.length === 0 ? (
        <EmptyState
          title="No Characters Available"
          description="This show doesn't have any characters yet"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          {characters.map((character) => (
            <CharacterCard key={character.id} character={character} />
          ))}
        </div>
      )}
    </div>
  );
}
