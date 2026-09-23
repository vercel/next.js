"use client";

import { User } from "lucide-react";
import { Character } from "@/lib/types";

interface CharacterCardProps {
  character: Character;
}

export const CharacterCard = ({ character }: CharacterCardProps) => {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-card border border-border hover:bg-muted/50 transition-colors">
      <div className="flex-shrink-0 w-16 h-16 rounded-full bg-muted flex items-center justify-center border border-border">
        <User className="w-8 h-8 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm truncate">{character.name}</h3>
        <p className="text-xs text-muted-foreground mb-1">{character.role}</p>
        {character.description && (
          <p className="text-xs text-muted-foreground/80 line-clamp-2">{character.description}</p>
        )}
      </div>
    </div>
  );
};
