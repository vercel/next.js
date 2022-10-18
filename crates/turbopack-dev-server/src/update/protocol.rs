use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    Subscribe {
        #[serde(rename = "chunkId")]
        chunk_id: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateInstruction<'a> {
    pub chunk_id: &'a str,
    #[serde(flatten)]
    pub ty: ClientUpdateInstructionType<'a>,
}

impl<'a> ClientUpdateInstruction<'a> {
    pub fn new(chunk_id: &'a str, ty: ClientUpdateInstructionType<'a>) -> Self {
        Self { chunk_id, ty }
    }
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientUpdateInstructionType<'a> {
    Restart,
    Partial { instruction: &'a str },
}
