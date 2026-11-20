use std::{
    io,
    net::{SocketAddr, SocketAddrV4, TcpListener, TcpStream},
    sync::Arc,
    thread::spawn,
};

use anyhow::Result;
use tungstenite::{Message, accept, error::ProtocolError};

use crate::{protocol::ProtocolSession, store_container::StoreContainer};

pub fn serve(store: Arc<StoreContainer>, port: u16) {
    let server = TcpListener::bind(SocketAddr::V4(SocketAddrV4::new(
        std::net::Ipv4Addr::new(127, 0, 0, 1),
        port,
    )))
    .unwrap();
    for stream in server.incoming() {
        let store = store.clone();
        spawn(move || {
            let websocket = accept(stream.unwrap()).unwrap();
            match handle_connection(websocket, store) {
                Ok(()) => {}
                Err(err) if is_disconnect(&err) => println!("Trace viewer disconnected"),
                Err(err) => eprintln!("Error: {err:?}"),
            }
        });
    }
}

/// Whether the client went away without a clean close handshake, e.g. when
/// the viewer tab is closed or reloaded while an update is being sent.
fn is_disconnect(err: &anyhow::Error) -> bool {
    match err.downcast_ref::<tungstenite::Error>() {
        Some(
            tungstenite::Error::ConnectionClosed
            | tungstenite::Error::AlreadyClosed
            | tungstenite::Error::Protocol(ProtocolError::ResetWithoutClosingHandshake),
        ) => true,
        Some(tungstenite::Error::Io(err)) => matches!(
            err.kind(),
            io::ErrorKind::ConnectionReset
                | io::ErrorKind::ConnectionAborted
                | io::ErrorKind::BrokenPipe
                | io::ErrorKind::UnexpectedEof
        ),
        _ => false,
    }
}

fn handle_connection(
    mut websocket: tungstenite::WebSocket<TcpStream>,
    store: Arc<StoreContainer>,
) -> Result<()> {
    let mut session = ProtocolSession::new(store);
    loop {
        match websocket.read()? {
            Message::Text(text) => {
                for response in session.handle_text(&text)? {
                    websocket.send(Message::Text(response))?;
                }
            }
            Message::Close(_) => return Ok(()),
            Message::Ping(data) => websocket.send(Message::Pong(data))?,
            Message::Frame(_) | Message::Binary(_) | Message::Pong(_) => {}
        }
    }
}
