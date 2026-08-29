export function createRateGuard({ maxRequests = 18, windowMs = 60_000, now = Date.now } = {}) {
  const timestamps = []

  return {
    consume() {
      const cutoff = now() - windowMs
      while (timestamps.length > 0 && timestamps[0] <= cutoff) timestamps.shift()
      if (timestamps.length >= maxRequests) return false
      timestamps.push(now())
      return true
    },
  }
}
