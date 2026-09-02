use crate::{next_client::ClientContextType, next_server::ServerContextType};

pub(crate) mod resolve;
pub(crate) mod transforms;
pub(crate) mod webpack_rules;

pub(crate) enum ContextType {
    #[allow(dead_code)]
    Client(ClientContextType),
    Server(ServerContextType),
}
