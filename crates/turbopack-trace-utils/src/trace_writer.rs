use std::{debug_assert, io::Write, thread::JoinHandle};

use crossbeam_channel::{bounded, unbounded, Receiver, Sender, TryRecvError};

#[derive(Clone, Debug)]
pub struct TraceWriter {
    data_tx: Sender<Vec<u8>>,
    return_rx: Receiver<Vec<u8>>,
}

impl TraceWriter {
    /// This is a non-blocking writer that writes a file in a background thread.
    /// This is inspired by tracing-appender non_blocking, but has some
    /// differences:
    /// * It allows writing an owned Vec<u8> instead of a reference, so avoiding
    ///   additional allocation.
    /// * It uses an unbounded channel to avoid slowing down the application at
    ///   all (memory) cost.
    /// * It issues less writes by buffering the data into chunks of ~1MB, when
    ///   possible.
    pub fn new<W: Write + Send + 'static>(mut writer: W) -> (Self, TraceWriterGuard) {
        let (data_tx, data_rx) = unbounded::<Vec<u8>>();
        let (return_tx, return_rx) = bounded::<Vec<u8>>(1024 * 10);

        let handle: std::thread::JoinHandle<()> = std::thread::spawn(move || {
            let _ = writer.write(b"TRACEv0");
            let mut buf = Vec::with_capacity(1024 * 1024 * 1024);
            'outer: loop {
                if !buf.is_empty() {
                    let _ = writer.write_all(&buf);
                    let _ = writer.flush();
                    buf.clear();
                }
                let Ok(mut data) = data_rx.recv() else {
                    break 'outer;
                };
                if data.is_empty() {
                    break 'outer;
                }
                if data.len() > buf.capacity() {
                    let _ = writer.write_all(&data);
                } else {
                    buf.extend_from_slice(&data);
                }
                data.clear();
                let _ = return_tx.try_send(data);
                loop {
                    match data_rx.try_recv() {
                        Ok(data) => {
                            if data.is_empty() {
                                break 'outer;
                            }
                            if buf.len() + data.len() > buf.capacity() {
                                let _ = writer.write_all(&buf);
                                buf.clear();
                                if data.len() > buf.capacity() {
                                    let _ = writer.write_all(&data);
                                } else {
                                    buf.extend_from_slice(&data);
                                }
                            } else {
                                buf.extend_from_slice(&data);
                            }
                        }
                        Err(TryRecvError::Disconnected) => {
                            break 'outer;
                        }
                        Err(TryRecvError::Empty) => {
                            break;
                        }
                    }
                }
            }
            if !buf.is_empty() {
                let _ = writer.write_all(&buf);
            }
            let _ = writer.flush();
            drop(writer);
        });

        (
            Self {
                data_tx: data_tx.clone(),
                return_rx: return_rx.clone(),
            },
            TraceWriterGuard {
                data_tx: Some(data_tx),
                return_rx: Some(return_rx),
                handle: Some(handle),
            },
        )
    }

    pub fn write(&self, data: Vec<u8>) {
        debug_assert!(!data.is_empty());
        let _ = self.data_tx.send(data);
    }

    pub fn try_get_buffer(&self) -> Option<Vec<u8>> {
        self.return_rx.try_recv().ok()
    }
}

pub struct TraceWriterGuard {
    data_tx: Option<Sender<Vec<u8>>>,
    return_rx: Option<Receiver<Vec<u8>>>,
    handle: Option<JoinHandle<()>>,
}

impl Drop for TraceWriterGuard {
    fn drop(&mut self) {
        let _ = self.data_tx.take().unwrap().send(Vec::new());
        let return_rx = self.return_rx.take().unwrap();
        while return_rx.recv().is_ok() {}
        let _ = self.handle.take().unwrap().join();
    }
}
