"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Channel } from "@/lib/types";

interface ChannelFormProps {
  channel?: Channel;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ChannelForm = ({ channel, onSubmit, onCancel, isLoading }: ChannelFormProps) => {
  const [name, setName] = useState(channel?.name || "");
  const [description, setDescription] = useState(channel?.description || "");
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});

  const validate = (): boolean => {
    const newErrors: { name?: string; description?: string } = {};

    if (!name.trim()) {
      newErrors.name = "Channel name is required";
    } else if (name.trim().length > 100) {
      newErrors.name = "Channel name must be 100 characters or less";
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
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      onSubmit(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <Label htmlFor="name">Channel Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter channel name"
          disabled={isLoading}
          className={errors.name ? "border-destructive" : ""}
        />
        {errors.name && <p className="text-sm text-destructive mt-1.5">{errors.name}</p>}
      </div>

      <div className="space-y-3">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter channel description"
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
          {isLoading ? "Saving..." : channel ? "Update Channel" : "Create Channel"}
        </Button>
      </div>
    </form>
  );
};
