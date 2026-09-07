// Small helpers shared by the route modules.

/** An error with an HTTP status; the message is shown to the user verbatim. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const badRequest = (m) => new HttpError(400, m)
export const unauthorized = (m = 'Not signed in.') => new HttpError(401, m)
export const forbidden = (m = 'Not authorized.') => new HttpError(403, m)
export const notFound = (m = 'Not found.') => new HttpError(404, m)

/** Wraps an async handler so thrown errors reach the error middleware. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** Express error middleware: HttpError -> its status, anything else -> 500. */
export function errorHandler(err, _req, res, _next) {
  const status = err instanceof HttpError ? err.status : 500
  if (status >= 500) console.error('[api]', err)
  res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : err.message })
}

/** Reads a field, trims it, and rejects empties. */
export function requireString(value, label) {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) throw badRequest(`${label} is required.`)
  return v
}
