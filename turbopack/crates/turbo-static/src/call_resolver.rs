use std::{fs::OpenOptions, path::PathBuf};

use rustc_hash::FxHashMap;

use crate::{Identifier, IdentifierReference, lsp_client::RAClient};

/// A wrapper around a rust-analyzer client that can resolve call references.
/// This is quite expensive so we cache the results in an on-disk key-value
/// store.
pub struct CallResolver<'a> {
    client: &'a mut RAClient,
    state: FxHashMap<Identifier, Vec<IdentifierReference>>,
    path: Option<PathBuf>,
}

/// On drop, serialize the state to disk
impl Drop for CallResolver<'_> {
    fn drop(&mut self) {
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(self.path.as_ref().unwrap())
            .unwrap();
        bincode::serialize_into(file, &self.state).unwrap();
    }
}

impl<'a> CallResolver<'a> {
    pub fn new(client: &'a mut RAClient, path: Option<PathBuf>) -> Self {
        // load bincode-encoded FxHashMap from path
        let state = path
            .as_ref()
            .and_then(|path| {
                let file = OpenOptions::new()
                    .create(true)
                    .truncate(false)
                    .read(true)
                    .write(true)
                    .open(path)
                    .unwrap();
                let reader = std::io::BufReader::new(file);
                bincode::deserialize_from::<_, FxHashMap<Identifier, Vec<IdentifierReference>>>(
                    reader,
                )
                .inspect_err(|_| {
                    tracing::warn!("failed to load existing cache, restarting");
                })
                .ok()
            })
            .unwrap_or_default();
        Self {
            client,
            state,
            path,
        }
    }

    pub fn cached_count(&self) -> usize {
        self.state.len()
    }

    pub fn cleared(mut self) -> Self {
        // delete file if exists and clear state
        self.state = Default::default();
        if let Some(path) = self.path.as_ref() {
            std::fs::remove_file(path).unwrap();
        }
        self
    }

    pub fn resolve(&mut self, ident: &Identifier) -> Vec<IdentifierReference> {
        if let Some(data) = self.state.get(ident) {
            tracing::info!("skipping {}", ident);
            return data.to_owned();
        };

        tracing::info!("checking {}", ident);

        let mut count = 0;
        let _response = loop {
            let Some(response) = self.client.request(lsp_server::Request {
                id: 1.into(),
                method: "textDocument/prepareCallHierarchy".to_string(),
                params: serde_json::to_value(&lsp_types::CallHierarchyPrepareParams {
                    text_document_position_params: lsp_types::TextDocumentPositionParams {
                        position: ident.range.start,
                        text_document: lsp_types::TextDocumentIdentifier {
                            uri: lsp_types::Url::from_file_path(&ident.path).unwrap(),
                        },
                    },
                    work_done_progress_params: lsp_types::WorkDoneProgressParams {
                        work_done_token: Some(lsp_types::ProgressToken::String(
                            "prepare".to_string(),
                        )),
                    },
                })
                .unwrap(),
            }) else {
                tracing::warn!("RA server shut down");
                return vec![];
            };

            if let Some(Some(value)) = response.result.as_ref().map(|r| r.as_array()) {
                if !value.is_empty() {
                    break value.to_owned();
                }
                count += 1;
            }

            // textDocument/prepareCallHierarchy will sometimes return an empty array so try
            // at most 5 times
            if count > 5 {
                tracing::warn!("discovered isolated task {}", ident);
                break vec![];
            }

            std::thread::sleep(std::time::Duration::from_secs(1));
        };

        // callHierarchy/incomingCalls
        let Some(response) = self.client.request(lsp_server::Request {
            id: 1.into(),
            method: "callHierarchy/incomingCalls".to_string(),
            params: serde_json::to_value(lsp_types::CallHierarchyIncomingCallsParams {
                partial_result_params: lsp_types::PartialResultParams::default(),
                item: lsp_types::CallHierarchyItem {
                    name: ident.name.to_owned(),
                    kind: lsp_types::SymbolKind::FUNCTION,
                    data: None,
                    tags: None,
                    detail: None,
                    uri: lsp_types::Url::from_file_path(&ident.path).unwrap(),
                    range: ident.range,
                    selection_range: ident.range,
                },
                work_done_progress_params: lsp_types::WorkDoneProgressParams {
                    work_done_token: Some(lsp_types::ProgressToken::String("prepare".to_string())),
                },
            })
            .unwrap(),
        }) else {
            tracing::warn!("RA server shut down");
            return vec![];
        };

        let links = if let Some(e) = response.error {
            tracing::warn!("unable to resolve {}: {:?}", ident, e);
            vec![]
        } else {
            let response: Result<Vec<lsp_types::CallHierarchyIncomingCall>, _> =
                serde_path_to_error::deserialize(response.result.unwrap());

            response
                .unwrap()
                .into_iter()
                .map(|i| i.into())
                .collect::<Vec<IdentifierReference>>()
        };

        tracing::debug!("links: {:?}", links);

        self.state.insert(ident.to_owned(), links.clone());
        links
    }
}
