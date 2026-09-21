//! Tracing pipeline: structured logs to an XDG log file (and stderr when
//! `RUST_LOG` demands it). No `tracing-appender` dependency — a tiny
//! [`MakeWriter`] over an append-mode [`std::fs::File`] suffices for Phase 0.

use std::fs::{File, OpenOptions};
use std::io::Write as _;
use std::path::PathBuf;
use std::sync::Mutex;

use tracing_subscriber::fmt::MakeWriter;

/// Append-only writer wrapping an optional log file. When the file could not
/// be opened (permissions, read-only fs) records are silently dropped instead
/// of crashing the shell — logging must never take the app down.
struct FileLogWriter(Mutex<Option<File>>);

impl<'a> MakeWriter<'a> for FileLogWriter {
    type Writer = FileLogWriterGuard<'a>;

    fn make_writer(&'a self) -> Self::Writer {
        FileLogWriterGuard(&self.0)
    }
}

struct FileLogWriterGuard<'a>(&'a Mutex<Option<File>>);

impl std::io::Write for FileLogWriterGuard<'_> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let mut guard = match self.0.lock() {
            Ok(g) => g,
            Err(_) => return Ok(buf.len()), // poisoned: drop silently
        };
        match guard.as_mut() {
            Some(file) => file.write(buf),
            None => Ok(buf.len()),
        }
    }

    fn flush(&mut self) -> std::io::Result<()> {
        let mut guard = match self.0.lock() {
            Ok(g) => g,
            Err(_) => return Ok(()), // poisoned: drop silently
        };
        match guard.as_mut() {
            Some(file) => file.flush(),
            None => Ok(()),
        }
    }
}

/// Initialize the global tracing subscriber writing to
/// `$XDG_DATA_HOME/pw-backtest/logs/pw-app.log`.
///
/// Returns the log file path (even when the file could not be opened, so the
/// UI can surface where logs *would* live).
pub fn init() -> PathBuf {
    let dir = crate::config::Settings::default_log_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("pw-app.log");
    let file = OpenOptions::new().create(true).append(true).open(&path).ok();

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(FileLogWriter(Mutex::new(file)))
        .with_ansi(false)
        .try_init();

    path
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn writer_drops_records_without_file() {
        let writer = FileLogWriter(Mutex::new(None));
        let mut w = writer.make_writer();
        // must not error even with no backing file
        assert_eq!(w.write(b"hello").unwrap(), 5);
    }

    #[test]
    fn writer_writes_to_open_file() {
        let dir = std::env::temp_dir().join("pw-app-log-test");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("test.log");
        let file = OpenOptions::new().create(true).append(true).open(&path).unwrap();
        let writer = FileLogWriter(Mutex::new(Some(file)));
        let mut w = writer.make_writer();
        w.write_all(b"line\n").unwrap();
        w.flush().unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("line"));
    }
}
content.contains("line"));
    }
}
