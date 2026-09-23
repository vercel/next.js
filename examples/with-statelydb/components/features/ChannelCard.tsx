"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Channel } from "@/lib/types";

interface ChannelCardProps {
  channel: Channel;
}

export const ChannelCard = ({ channel }: ChannelCardProps) => {
  return (
    <Link href={`/channels/${channel.id}`} className="block h-full">
      <Card className="netflix-card h-full">
        <CardHeader>
          <CardTitle className="text-xl">{channel.name}</CardTitle>
          <CardDescription className="line-clamp-2">{channel.description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
};
