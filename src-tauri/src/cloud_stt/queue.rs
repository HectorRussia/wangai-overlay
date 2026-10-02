use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::Semaphore;

pub(super) struct StreamQueue {
    pub(super) semaphore: Semaphore,
    pub(super) queued: AtomicUsize,
}

impl Default for StreamQueue {
    fn default() -> Self {
        Self {
            semaphore: Semaphore::new(1),
            queued: AtomicUsize::new(0),
        }
    }
}

impl StreamQueue {
    pub(super) fn try_enqueue(&self) -> bool {
        let mut current = self.queued.load(Ordering::Acquire);
        loop {
            if current >= 2 {
                return false;
            }
            match self.queued.compare_exchange_weak(
                current,
                current + 1,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return true,
                Err(actual) => current = actual,
            }
        }
    }
}

