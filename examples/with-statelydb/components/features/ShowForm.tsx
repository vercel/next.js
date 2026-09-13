"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Show, Channel } from "@/lib/types";

interface ShowFormProps {
  show?: Show;
  channels: Channel[];
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ShowForm = ({ show, channels, onSubmit, onCancel, isLoading }: ShowFormProps) => {
  const [channelId, setChannelId] = useState<string>(
    show ? show.channelId : channels[0] ? channels[0].id : ""
  );
  const [title, setTitle] = useState(show?.title || "");
  const [description, setDescription] = useState(show?.description || "");
  const [year, setYear] = useState<string>(show?.year.toString() || "");
  const [errors, setErrors] = useState<{ channelId?: string; title?: string; description?: string; year?: string }>({});

  const validate = (): boolean => {
    const newErrors: { channelId?: string; title?: string; description?: string; year?: string } = {};

    if (!channelId) {
      newErrors.channelId = "Channel is required";
    }

    if (!title.trim()) {
      newErrors.title = "Show title is required";
    } else if (title.trim().length > 200) {
      newErrors.title = "Show title must be 200 characters or less";
    }

    if (!description.trim()) {
      newErrors.description = "Description is required";
    } else if (description.trim().length > 1000) {
      newErrors.description = "Description must be 1000 characters or less";
    }

    const yearNum = parseInt(year, 10);
    if (!year.trim()) {
      newErrors.year = "Year is required";
    } else if (isNaN(yearNum)) {
      newErrors.year = "Year must be a valid number";
    } else if (yearNum < 1900 || yearNum > 2030) {
      newErrors.year = "Year must be between 1900 and 2030";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (validate()) {
      const formData = new FormData();
      formData.append("channelId", channelId);
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("year", year.trim());
      onSubmit(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <Label htmlFor="channelId">Channel *</Label>
        <select
          id="channelId"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          disabled={isLoading || !!show}
          className={`flex h-10 w-full rounded-md border ${
            errors.channelId ? "border-destructive" : "border-input"
          } bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <option value="">Select a channel</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
        {errors.channelId && <p className="text-sm text-destructive mt-1.5">{errors.channelId}</p>}
      </div>

      <div className="space-y-3">
        <Label htmlFor="title">Show Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter show title"
          disabled={isLoading}
          className={errors.title ? "border-destructive" : ""}
        />
        {errors.title && <p className="text-sm text-destructive mt-1.5">{errors.title}</p>}
      </div>

      <div className="space-y-3">
        <Label htmlFor="year">Year *</Label>
        <Input
          id="year"
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Enter year (e.g., 2024)"
          disabled={isLoading}
          min={1900}
          max={2030}
          className={errors.year ? "border-destructive" : ""}
        />
        {errors.year && <p className="text-sm text-destructive mt-1.5">{errors.year}</p>}
      </div>

      <div className="space-y-3">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter show description"
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
          {isLoading ? "Saving..." : show ? "Update Show" : "Create Show"}
        </Button>
      </div>
    </form>
  );
};
