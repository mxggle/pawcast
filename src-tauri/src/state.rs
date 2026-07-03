use parking_lot::{Mutex, RwLock};
use std::{
    any::Any,
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc},
};

pub struct WatcherHandle {
    pub owner_window: String,
    pub canonical_root: PathBuf,
    pub handle: Box<dyn Any + Send>,
}

#[derive(Clone)]
pub struct WaveformJobState {
    pub owner_window: String,
    pub cancelled: Arc<AtomicBool>,
}

pub struct AppState {
    pub approved_paths: RwLock<HashSet<PathBuf>>,
    pub watcher_handles: Mutex<HashMap<String, WatcherHandle>>,
    pub active_data_directory: RwLock<PathBuf>,
    pub config_directory: PathBuf,
    pub config_mutation_locks: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    pub data_mutation_locks: Mutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>>,
    pub waveform_jobs: Mutex<HashMap<String, WaveformJobState>>,
}

impl AppState {
    pub fn new(config_directory: PathBuf, active_data_directory: PathBuf) -> Self {
        Self {
            approved_paths: RwLock::new(HashSet::new()),
            watcher_handles: Mutex::new(HashMap::new()),
            active_data_directory: RwLock::new(active_data_directory),
            config_directory,
            config_mutation_locks: Mutex::new(HashMap::new()),
            data_mutation_locks: Mutex::new(HashMap::new()),
            waveform_jobs: Mutex::new(HashMap::new()),
        }
    }

    pub fn approve_path(&self, path: impl AsRef<Path>) -> std::io::Result<PathBuf> {
        let canonical = path.as_ref().canonicalize()?;
        self.approved_paths.write().insert(canonical.clone());
        Ok(canonical)
    }

    pub fn is_path_approved(&self, path: impl AsRef<Path>) -> bool {
        let Ok(canonical) = path.as_ref().canonicalize() else {
            return false;
        };
        self.approved_paths
            .read()
            .iter()
            .any(|root| canonical == *root || canonical.starts_with(root))
    }

    pub fn cancel_waveform_job(&self, media_id: &str) -> bool {
        self.waveform_jobs
            .lock()
            .remove(media_id)
            .map(|job| {
                job.cancelled
                    .store(true, std::sync::atomic::Ordering::Release);
                true
            })
            .unwrap_or(false)
    }

    pub fn cancel_waveform_jobs_for_window(&self, owner_window: &str) -> usize {
        let mut jobs = self.waveform_jobs.lock();
        let media_ids = jobs
            .iter()
            .filter(|(_, job)| job.owner_window == owner_window)
            .map(|(media_id, _)| media_id.clone())
            .collect::<Vec<_>>();
        for media_id in &media_ids {
            if let Some(job) = jobs.remove(media_id) {
                job.cancelled
                    .store(true, std::sync::atomic::Ordering::Release);
            }
        }
        media_ids.len()
    }
}
