"use client";

import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChannelForm } from "@/components/features/ChannelForm";
import { ShowForm } from "@/components/features/ShowForm";
import { CharacterForm } from "@/components/features/CharacterForm";
import { ConfirmDialog } from "@/components/features/ConfirmDialog";
import { Channel, Show, Character } from "@/lib/types";
import {
  fetchChannels,
  fetchShows,
  fetchCharacters,
  createChannel,
  updateChannel,
  deleteChannel,
  createShow,
  updateShow,
  deleteShow,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  // (removed unused: fetchShowsByChannel, fetchCharactersByShow)
} from "@/lib/actions";
import { toast } from "sonner";
import Link from "next/link";

type EntityType = "channel" | "show" | "character";
type DialogMode = "create" | "edit" | "view";

export default function AdminPage() {
  const [isLoading, setIsLoading] = useState(true);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<EntityType>("channel");
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [editingEntity, setEditingEntity] = useState<Channel | Show | Character | null>(null);
  const [viewingEntity, setViewingEntity] = useState<Channel | Show | Character | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingEntity, setDeletingEntity] = useState<{ type: EntityType; id: string; name: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [channelsData, showsData, charactersData] = await Promise.all([
        fetchChannels(),
        fetchShows(),
        fetchCharacters(),
      ]);
      setChannels(channelsData);
      setShows(showsData);
      setCharacters(charactersData);
    } catch (error) {
      toast.error("Failed to load data");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Create handlers
  const handleCreateChannel = async (data: FormData) => {
    try {
      setIsSubmitting(true);
      await createChannel(data);
      await loadData();
      setDialogOpen(false);
      toast.success("Channel created successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateShow = async (data: FormData) => {
    try {
      setIsSubmitting(true);
      const channelId = data.get("channelId") as string;
      await createShow(channelId, data);
      await loadData();
      setDialogOpen(false);
      toast.success("Show created successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create show");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCharacter = async (data: FormData) => {
    try {
      setIsSubmitting(true);
      const channelId = data.get("channelId") as string;
      const showId = data.get("showId") as string;
      await createCharacter(channelId, showId, data);
      await loadData();
      setDialogOpen(false);
      toast.success("Character created successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create character");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update handlers
  const handleUpdateChannel = async (data: FormData) => {
    if (!editingEntity) return;
    try {
      setIsSubmitting(true);
      const channel = editingEntity as Channel;
      await updateChannel(channel.id, data);
      await loadData();
      setDialogOpen(false);
      setEditingEntity(null);
      toast.success("Channel updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update channel");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateShow = async (data: FormData) => {
    if (!editingEntity) return;
    try {
      setIsSubmitting(true);
      const show = editingEntity as Show;
      await updateShow(show.channelId, show.id, data);
      await loadData();
      setDialogOpen(false);
      setEditingEntity(null);
      toast.success("Show updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update show");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCharacter = async (data: FormData) => {
    if (!editingEntity) return;
    try {
      setIsSubmitting(true);
      const character = editingEntity as Character;
      await updateCharacter(character.channelId, character.showId, character.id, data);
      await loadData();
      setDialogOpen(false);
      setEditingEntity(null);
      toast.success("Character updated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update character");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!deletingEntity) return;
    try {
      if (deletingEntity.type === "channel") {
        await deleteChannel(deletingEntity.id);
      } else if (deletingEntity.type === "show") {
        const show = shows.find(s => s.id === deletingEntity.id);
        if (show) {
          await deleteShow(show.channelId, deletingEntity.id);
        }
      } else {
        const character = characters.find(c => c.id === deletingEntity.id);
        if (character) {
          await deleteCharacter(character.channelId, character.showId, deletingEntity.id);
        }
      }
      await loadData();
      setDeleteDialogOpen(false);
      setDeletingEntity(null);
      toast.success(`${deletingEntity.type.charAt(0).toUpperCase() + deletingEntity.type.slice(1)} deleted successfully`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to delete ${deletingEntity.type}`);
    }
  };

  // Dialog opening handlers
  const openCreateDialog = (type: EntityType) => {
    setDialogType(type);
    setDialogMode("create");
    setEditingEntity(null);
    setDialogOpen(true);
  };

  const openEditDialog = (type: EntityType, entity: Channel | Show | Character) => {
    setDialogType(type);
    setDialogMode("edit");
    setEditingEntity(entity);
    setDialogOpen(true);
  };

  const openDeleteDialog = (type: EntityType, id: string, name: string) => {
    setDeletingEntity({ type, id, name });
    setDeleteDialogOpen(true);
  };

  const openViewDialog = (type: EntityType, entity: Channel | Show | Character) => {
    setDialogType(type);
    setViewingEntity(entity);
    setViewDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading data...</p>
        </div>
      </div>
    );
  }

  const getChannelName = (channelId: string) => {
    return channels.find(c => c.id === channelId)?.name || "Unknown Channel";
  };

  const getShowTitle = (showId: string) => {
    return shows.find(s => s.id === showId)?.title || "Unknown Show";
  };

  const getShowCount = (channelId: string) => {
    return shows.filter(s => s.channelId === channelId).length;
  };

  const getCharacterCount = (showId: string) => {
    return characters.filter(c => c.showId === showId).length;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container py-6 px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-1">Admin Dashboard</h1>
              <p className="text-muted-foreground">Manage channels, shows, and characters</p>
            </div>
            <Link href="/">
              <Button variant="outline">View Site</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container py-8 px-4">
        <Tabs defaultValue="channels" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="channels">Channels ({channels.length})</TabsTrigger>
            <TabsTrigger value="shows">Shows ({shows.length})</TabsTrigger>
            <TabsTrigger value="characters">Characters ({characters.length})</TabsTrigger>
          </TabsList>

          {/* Channels Tab */}
          <TabsContent value="channels" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Channels</h2>
              <Button onClick={() => openCreateDialog("channel")}>
                <Plus className="h-4 w-4 mr-2" />
                Add Channel
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Description</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Shows</th>
                    <th className="text-right px-4 py-3 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-muted-foreground">
                        No channels found
                      </td>
                    </tr>
                  ) : (
                    channels.map((channel) => (
                      <tr
                        key={channel.id}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer"
                        onClick={() => openViewDialog("channel", channel)}
                      >
                        <td className="px-4 py-3 font-medium">{channel.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{channel.description}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {getShowCount(channel.id)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog("channel", channel)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog("channel", channel.id, channel.name)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Shows Tab */}
          <TabsContent value="shows" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Shows</h2>
              <Button onClick={() => openCreateDialog("show")} disabled={channels.length === 0}>
                <Plus className="h-4 w-4 mr-2" />
                Add Show
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Title</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Channel</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Year</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Characters</th>
                    <th className="text-right px-4 py-3 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">
                        No shows found
                      </td>
                    </tr>
                  ) : (
                    shows.map((show) => (
                      <tr
                        key={show.id}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer"
                        onClick={() => openViewDialog("show", show)}
                      >
                        <td className="px-4 py-3 font-medium">{show.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {getChannelName(show.channelId)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{show.year}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {getCharacterCount(show.id)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog("show", show)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog("show", show.id, show.title)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Characters Tab */}
          <TabsContent value="characters" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Characters</h2>
              <Button onClick={() => openCreateDialog("character")} disabled={shows.length === 0}>
                <Plus className="h-4 w-4 mr-2" />
                Add Character
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Role</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Show</th>
                    <th className="text-left px-4 py-3 font-semibold text-sm">Description</th>
                    <th className="text-right px-4 py-3 font-semibold text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {characters.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">
                        No characters found
                      </td>
                    </tr>
                  ) : (
                    characters.map((character) => (
                      <tr
                        key={character.id}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer"
                        onClick={() => openViewDialog("character", character)}
                      >
                        <td className="px-4 py-3 font-medium">{character.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">{character.role}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {getShowTitle(character.showId)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                          {character.description}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog("character", character)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog("character", character.id, character.name)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
        {/* Reset Data Section */}
        <div className="mt-12 border-t border-border pt-8">
          <div className="bg-muted/30 border border-border rounded-lg p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <RotateCcw className="h-5 w-5" /> Reset All Data
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-prose">
                This will delete all channels, shows, and characters and then you can re-bootstrap the demo data. This action cannot be undone.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setResetDialogOpen(true)}>
              <RotateCcw className="h-4 w-4 mr-2" /> Reset Data
            </Button>
          </div>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? "Create" : "Edit"} {dialogType.charAt(0).toUpperCase() + dialogType.slice(1)}
            </DialogTitle>
          </DialogHeader>
          {dialogType === "channel" && (
            <ChannelForm
              channel={dialogMode === "edit" ? (editingEntity as Channel) : undefined}
              onSubmit={dialogMode === "create" ? handleCreateChannel : handleUpdateChannel}
              onCancel={() => setDialogOpen(false)}
              isLoading={isSubmitting}
            />
          )}
          {dialogType === "show" && (
            <ShowForm
              show={dialogMode === "edit" ? (editingEntity as Show) : undefined}
              channels={channels}
              onSubmit={dialogMode === "create" ? handleCreateShow : handleUpdateShow}
              onCancel={() => setDialogOpen(false)}
              isLoading={isSubmitting}
            />
          )}
          {dialogType === "character" && (
            <CharacterForm
              character={dialogMode === "edit" ? (editingEntity as Character) : undefined}
              shows={shows}
              channels={channels}
              onSubmit={dialogMode === "create" ? handleCreateCharacter : handleUpdateCharacter}
              onCancel={() => setDialogOpen(false)}
              isLoading={isSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={`Delete ${deletingEntity?.type.charAt(0).toUpperCase()}${deletingEntity?.type.slice(1)}`}
        description={`Are you sure you want to delete "${deletingEntity?.name}"?${
          deletingEntity?.type === "channel"
            ? " This will also delete all shows and characters in this channel."
            : deletingEntity?.type === "show"
            ? " This will also delete all characters in this show."
            : ""
        } This action cannot be undone.`}
        onConfirm={handleDelete}
      />

      {/* Reset All Data Dialog */}
      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset All Data"
        description="Are you absolutely sure? This will permanently delete ALL channels, shows, and characters. You will be redirected to re-bootstrap demo data."
        confirmLabel="Reset"
        onConfirm={() => {
          setResetDialogOpen(false);
          window.location.href = "/admin/reset";
        }}
      />

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              View {dialogType.charAt(0).toUpperCase() + dialogType.slice(1)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {viewingEntity && dialogType === "channel" && (
              <>
                <div>
                  <label className="text-sm font-semibold">Name</label>
                  <p className="text-sm text-muted-foreground mt-1">{(viewingEntity as Channel).name}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Description</label>
                  <p className="text-sm text-muted-foreground mt-1">{(viewingEntity as Channel).description}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Number of Shows</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getShowCount((viewingEntity as Channel).id)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Created</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date((viewingEntity as Channel).createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Last Updated</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date((viewingEntity as Channel).updatedAt).toLocaleString()}
                  </p>
                </div>
              </>
            )}
            {viewingEntity && dialogType === "show" && (
              <>
                <div>
                  <label className="text-sm font-semibold">Title</label>
                  <p className="text-sm text-muted-foreground mt-1">{(viewingEntity as Show).title}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Channel</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getChannelName((viewingEntity as Show).channelId)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Year</label>
                  <p className="text-sm text-muted-foreground mt-1">{(viewingEntity as Show).year}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Description</label>
                  <p className="text-sm text-muted-foreground mt-1">{(viewingEntity as Show).description}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Number of Characters</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getCharacterCount((viewingEntity as Show).id)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Created</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date((viewingEntity as Show).createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Last Updated</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date((viewingEntity as Show).updatedAt).toLocaleString()}
                  </p>
                </div>
              </>
            )}
            {viewingEntity && dialogType === "character" && (
              <>
                <div>
                  <label className="text-sm font-semibold">Name</label>
                  <p className="text-sm text-muted-foreground mt-1">{(viewingEntity as Character).name}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Role</label>
                  <p className="text-sm text-muted-foreground mt-1">{(viewingEntity as Character).role}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Show</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getShowTitle((viewingEntity as Character).showId)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Description</label>
                  <p className="text-sm text-muted-foreground mt-1">{(viewingEntity as Character).description}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Created</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date((viewingEntity as Character).createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold">Last Updated</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date((viewingEntity as Character).updatedAt).toLocaleString()}
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (viewingEntity) {
                  setViewDialogOpen(false);
                  openEditDialog(dialogType, viewingEntity);
                }
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
