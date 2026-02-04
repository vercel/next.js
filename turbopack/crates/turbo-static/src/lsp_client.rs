use std::{path::PathBuf, process, sync::mpsc};

use lsp_server::Message;

/// An LSP client for Rust Analyzer (RA) that launches it as a subprocess.
pub struct RAClient {
    /// Handle to the client
    handle: process::Child,
    sender: Option<mpsc::SyncSender<Message>>,
    receiver: Option<mpsc::Receiver<Message>>,
}

impl RAClient {
    /// Create a new LSP client for Rust Analyzer.
    pub fn new() -> Self {
        let stdin = process::Stdio::piped();
        let stdout = process::Stdio::piped();
        let stderr = process::Stdio::inherit();

        let child = process::Command::new("rust-analyzer")
            .stdin(stdin)
            .stdout(stdout)
            .stderr(stderr)
            // .env("RA_LOG", "info")
            .env("RUST_BACKTRACE", "1")
            .spawn()
            .expect("Failed to start RA LSP server");
        Self {
            handle: child,
            sender: None,
            receiver: None,
        }
    }

    pub fn start(&mut self, folders: &[PathBuf]) {
        let stdout = self.handle.stdout.take().unwrap();
        let mut stdin = self.handle.stdin.take().unwrap();

        let (writer_sender, writer_receiver) = mpsc::sync_channel::<Message>(0);
        _ = std::thread::spawn(move || {
            writer_receiver
                .into_iter()
                .try_for_each(|it| it.write(&mut stdin))
        });

        let (reader_sender, reader_receiver) = mpsc::sync_channel::<Message>(0);
        _ = std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stdout);
            while let Ok(Some(msg)) = Message::read(&mut reader) {
                reader_sender
                    .send(msg)
                    .expect("receiver was dropped, failed to send a message");
            }
        });

        self.sender = Some(writer_sender);
        self.receiver = Some(reader_receiver);

        let workspace_paths = folders
            .iter()
            .map(|p| std::fs::canonicalize(p).unwrap())
            .map(|p| lsp_types::WorkspaceFolder {
                name: p.file_name().unwrap().to_string_lossy().to_string(),
                uri: lsp_types::Url::from_file_path(p).unwrap(),
            })
            .collect::<Vec<_>>();

        _ = self.request(lsp_server::Request {
            id: 1.into(),
            method: "initialize".to_string(),
            params: serde_json::to_value(lsp_types::InitializeParams {
                workspace_folders: Some(workspace_paths),
                process_id: Some(std::process::id()),
                capabilities: lsp_types::ClientCapabilities {
                    workspace: Some(lsp_types::WorkspaceClientCapabilities {
                        workspace_folders: Some(true),
                        ..Default::default()
                    }),
                    ..Default::default()
                },
                work_done_progress_params: lsp_types::WorkDoneProgressParams {
                    work_done_token: Some(lsp_types::ProgressToken::String("prepare".to_string())),
                },
                // we use workspace_folders so root_path and root_uri can be
                // empty
                ..Default::default()
            })
            .unwrap(),
        });

        self.notify(lsp_server::Notification {
            method: "initialized".to_string(),
            params: serde_json::to_value(lsp_types::InitializedParams {}).unwrap(),
        });
    }

    /// Send an LSP request to the server. This returns an option
    /// in the case of an error such as the server being shut down
    /// from pressing `Ctrl+C`.
    pub fn request(&mut self, message: lsp_server::Request) -> Option<lsp_server::Response> {
        tracing::debug!("sending {:?}", message);
        self.sender
            .as_mut()
            .unwrap()
            .send(Message::Request(message))
            .ok()?;

        loop {
            match self.receiver.as_mut().unwrap().recv() {
                Ok(lsp_server::Message::Response(response)) => {
                    tracing::debug!("received {:?}", response);
                    return Some(response);
                }
                Ok(m) => tracing::trace!("unexpected message: {:?}", m),
                Err(_) => {
                    tracing::trace!("error receiving message");
                    return None;
                }
            }
        }
    }

    pub fn notify(&mut self, message: lsp_server::Notification) {
        self.sender
            .as_mut()
            .unwrap()
            .send(Message::Notification(message))
            .expect("failed to send message");
    }
}

impl Drop for RAClient {
    fn drop(&mut self) {
        if self.sender.is_some() {
            let Some(resp) = self.request(lsp_server::Request {
                id: 1.into(),
                method: "shutdown".to_string(),
                params: serde_json::to_value(()).unwrap(),
            }) else {
                return;
            };

            if resp.error.is_none() {
                tracing::info!("shutting down RA LSP server");
                self.notify(lsp_server::Notification {
                    method: "exit".to_string(),
                    params: serde_json::to_value(()).unwrap(),
                });
                self.handle
                    .wait()
                    .expect("failed to wait for RA LSP server");
                tracing::info!("shut down RA LSP server");
            } else {
                tracing::error!("failed to shutdown RA LSP server: {:#?}", resp);
            }
        }

        self.sender = None;
        self.receiver = None;
    }
}
