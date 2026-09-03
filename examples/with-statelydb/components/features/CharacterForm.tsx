"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Character, Show, Channel } from "@/lib/types";

interface CharacterFormProps {
  character?: Character;
  shows: Show[];
  channels: Channel[];
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const CharacterForm = ({
  character,
  shows,
  channels,
  onSubmit,
  onCancel,
  isLoading,
}: CharacterFormProps) => {
  const [showId, setShowId] = useState<string>(
    character ? character.showId : shows[0] ? shows[0].id : ""
  );
  const [name, setName] = useState(character?.name || "");
  const [role, setRole] = useState(character?.role || "");
  const [description, setDescription] = useState(character?.description || "");
  const [errors, setErrors] = useState<{ showId?: string; name?: string; role?: string; description?: string }>({});

  // Get the channelId for the selected show
  const getChannelIdForShow = (showIdStr: string): string => {
    const show = shows.find(s => s.id === showIdStr);
    return show ? show.channelId : "";
  };

  const validate = (): boolean => {
    const newErrors: { showId?: string; name?: string; role?: string; description?: string } = {};

    if (!showId) {
      newErrors.showId = "Show is required";
    }

    if (!name.trim()) {
      newErrors.name = "Character name is required";
    } else if (name.trim().length > 100) {
      newErrors.name = "Character name must be 100 characters or less";
    }

    if (!role.trim()) {
      newErrors.role = "Role is required";
    } else if (role.trim().length > 100) {
      newErrors.role = "Role must be 100 characters or less";
    }

    if (!description.trim()) {
      newErrors.description = "Description is required";
    } else if (description.trim().length > 500) {
      newErrors.description = "Description must be 500 characters or less";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (validate()) {
      const formData = new FormData();
      formData.append("channelId", getChannelIdForShow(showId));
      formData.append("showId", showId);
      formData.append("name", name.trim());
      formData.append("role", role.trim());
      formData.append("description", description.trim());
      onSubmit(formData);
    }
  };

  // Group shows by channel
  const showsByChannel = channels.map(channel => {
    return {
      channel,
      shows: shows.filter(s => s.channelId === channel.id)
    };
  }).filter(group => group.shows.length > 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <Label htmlFor="showId">Show *</Label>
        <select
          id="showId"
          value={showId}
          onChange={(e) => setShowId(e.target.value)}
          disabled={isLoading || !!character}
          className={`flex h-10 w-full rounded-md border ${
            errors.showId ? "border-destructive" : "border-input"
          } bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <option value="">Select a show</option>
          {showsByChannel.map(({ channel, shows: channelShows }) => (
            <optgroup key={channel.id} label={channel.name}>
              {channelShows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.title} ({show.year})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {errors.showId && <p className="text-sm text-destructive mt-1.5">{errors.showId}</p>}
      </div>

      <div className="space-y-3">
        <Label htmlFor="name">Character Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter character name"
          disabled={isLoading}
          className={errors.name ? "border-destructive" : ""}
        />
        {errors.name && <p className="text-sm text-destructive mt-1.5">{errors.name}</p>}
      </div>

      <div className="space-y-3">
        <Label htmlFor="role">Role *</Label>
        <Input
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Enter character role"
          disabled={isLoading}
          className={errors.role ? "border-destructive" : ""}
        />
        {errors.role && <p className="text-sm text-destructive mt-1.5">{errors.role}</p>}
      </div>

      <div className="space-y-3">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter character description"
          rows={4}
          disabled={isLoading}
          className={errors.description ? "border-destructive" : ""}
        />
        {errors.description && <p className="text-sm text-destructive mt-1.5">{errors.description}</p>}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading} size="lg">
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading} size="lg">
          {isLoading ? "Saving..." : character ? "Update Character" : "Create Character"}
        </Button>
      </div>
    </form>
  );
};
