use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use anyhow::{Context, Result};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};

static NEXT_ARTIFACT: AtomicU64 = AtomicU64::new(1);

/// Handles live only for one recipe request. They never enter persistent cache
/// keys, and dropping the request releases its source and output buffers.
#[derive(Default)]
pub(crate) struct Artifacts {
    contents: HashMap<u64, Arc<[u8]>>,
}

impl Artifacts {
    pub(crate) fn insert(&mut self, bytes: Vec<u8>) -> u64 {
        let id = NEXT_ARTIFACT.fetch_add(1, Ordering::Relaxed);
        self.contents.insert(id, bytes.into());
        id
    }

    pub(crate) fn get(&self, id: u64) -> Result<Arc<[u8]>> {
        self.contents
            .get(&id)
            .cloned()
            .context("Unknown artifact in this recipe")
    }

    pub(crate) fn bytes(&self, file: &Value) -> Result<Arc<[u8]>> {
        if let Some(data) = file.get("data") {
            Ok(STANDARD
                .decode(data.as_str().context("Missing output bytes")?)?
                .into())
        } else {
            self.get(
                file["artifact"]
                    .as_u64()
                    .context("Missing artifact handle")?,
            )
        }
    }

    /// Only the emitter or a JavaScript plugin that consumes contents needs
    /// bytes on the wire. Resolve handles before constructing cache keys.
    pub(crate) fn hydrate(&self, file: &mut Value) -> Result<()> {
        let file = file
            .as_object_mut()
            .context("Invalid artifact descriptor")?;
        if let Some(id) = file.remove("artifact") {
            let bytes = self.get(id.as_u64().context("Invalid artifact handle")?)?;
            file.insert("data".into(), json!(STANDARD.encode(bytes)));
        }
        Ok(())
    }

    /// Return metadata to the recipe while retaining cached bytes in Rust.
    pub(crate) fn retain(&mut self, file: &mut Value) -> Result<()> {
        let file = file
            .as_object_mut()
            .context("Invalid artifact descriptor")?;
        if let Some(data) = file.get("data").and_then(Value::as_str) {
            let id = self.insert(STANDARD.decode(data)?);
            file.remove("data");
            file.insert("artifact".into(), json!(id));
        }
        Ok(())
    }
}
