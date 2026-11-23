type SaveDraft = (id: string, value: string) => Promise<{ ok: boolean }>

// The editor page's client module fills this in. The caller page imports only
// this registry, so its worker does not bundle the action and the server has to
// forward the request to the worker that owns it.
export const itemActionRegistry: { saveDraft?: SaveDraft } = {}
