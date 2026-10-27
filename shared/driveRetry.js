const RATE_LIMIT_REASONS = new Set([
  "userRateLimitExceeded",
  "rateLimitExceeded",
  "sharingRateLimitExceeded",
  "backendError",
]);

const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ENETUNREACH",
]);

function isRetryableDriveError(error) {
  const networkCode = error?.code?.code || error?.code || error?.cause?.code || error?.errno;
  if (typeof networkCode === "string" && NETWORK_ERROR_CODES.has(networkCode)) return true;
  if (/ECONNRESET|ETIMEDOUT|socket hang up/i.test(String(error?.message || ""))) return true;

  const status = Number(error?.status || error?.code?.code || error?.code || error?.response?.status);
  if (status === 429 || (status >= 500 && status < 600)) return true;
  if (status !== 403) return false;

  const details = error?.errors || error?.code?.errors || error?.response?.data?.error?.errors || [];
  const message = String(error?.message || error?.code?.message || "");
  return /rate limit/i.test(message)
    || details.some((item) => RATE_LIMIT_REASONS.has(item?.reason));
}

/**
 * Reintenta una operación de Drive con espera exponencial cuando Google
 * responde con límites de cuota temporales. La operación debe crear sus
 * streams dentro de la función para que cada intento parta de cero.
 */
export async function withDriveRetry(operation, { retries = 5, baseDelayMs = 1000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || !isRetryableDriveError(error)) throw error;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
