// Read-only bootstrap: bound both rejected and never-settling IPC requests.
const REQUEST_TIMEOUT_MS = 3_000;
const RETRY_DELAY_MS = 250;
const abortError = () => new DOMException("Snapshot request cancelled", "AbortError");

function attempt<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      complete();
    };
    const aborted = () => finish(() => reject(abortError()));
    const timer = setTimeout(() => finish(() => reject(new Error("รอข้อมูลเริ่มต้นนานเกินไป"))), REQUEST_TIMEOUT_MS);
    signal.addEventListener("abort", aborted, { once: true });
    // IPC cannot be cancelled once sent; discard timed-out/aborted results.
    Promise.resolve().then(() => {
      if (signal.aborted) throw abortError();
      return read();
    }).then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}

function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const aborted = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, RETRY_DELAY_MS);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

export async function loadSnapshot<T>(read: () => Promise<T>, signal: AbortSignal, attempts = 5): Promise<T> {
  for (let index = 0; ; index += 1) {
    try { return await attempt(read, signal); }
    catch (error) {
      if (signal.aborted || index + 1 >= attempts) throw error;
      await pause(signal);
    }
  }
}
