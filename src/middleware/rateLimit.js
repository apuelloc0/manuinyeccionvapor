// Simple in-memory rate limiter for sensitive endpoints
// Keeps a sliding window of timestamps per key (userId or IP)
const attempts = new Map();

/**
 * rateLimitSecurityQuestions - middleware factory
 * @param {object} opts { windowMs, maxAttempts }
 */
export const rateLimitSecurityQuestions = (opts = {}) => {
  const windowMs = opts.windowMs || 15 * 60 * 1000; // 15 minutes
  const maxAttempts = opts.maxAttempts || 5;

  return (req, res, next) => {
    try {
      const key = (req.user && req.user.id) ? String(req.user.id) : req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      const now = Date.now();
      const entry = attempts.get(key) || [];

      // Prune timestamps outside window
      const pruned = entry.filter(ts => (now - ts) <= windowMs);
      pruned.push(now);
      attempts.set(key, pruned);

      if (pruned.length > maxAttempts) {
        const retryAfter = Math.ceil((windowMs - (now - pruned[0])) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ ok: false, message: `Demasiados intentos. Intenta de nuevo en ${retryAfter} segundos.` });
      }

      // Lightweight cleanup to avoid memory growth: remove keys with empty arrays periodically
      if (attempts.size > 5000) {
        const cutoff = now - windowMs;
        for (const [k, arr] of attempts.entries()) {
          if (!arr || arr.length === 0 || arr[arr.length - 1] < cutoff) attempts.delete(k);
        }
      }

      return next();
    } catch (err) {
      // On error, don't block the request; move forward
      return next();
    }
  };
};

export default rateLimitSecurityQuestions;
