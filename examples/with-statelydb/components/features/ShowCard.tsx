"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Show } from "@/lib/types";

interface ShowCardProps {
  show: Show;
  channelId: string;
}

export const ShowCard = ({ show, channelId }: ShowCardProps) => {
  return (
    <Link href={`/channels/${channelId}/shows/${show.id}`} className="block h-full">
      <Card className="netflix-card h-full">
        <CardHeader>
          <CardTitle className="text-lg">{show.title}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">{show.year}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-3">{show.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
};
