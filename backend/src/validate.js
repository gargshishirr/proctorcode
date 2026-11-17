// Small input validation helpers. Handlers throw HttpError; the error handler turns it into JSON.

export class HttpError extends Error {
  constructor(status, message, extra = undefined) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (message) => new HttpError(400, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);
export const forbidden = (message = 'Forbidden') => new HttpError(403, message);

// Strip control characters (except tab/newline for multi-line fields).
const CONTROL_SINGLE = /[\u0000-\u001f\u007f]/g;
const CONTROL_MULTI = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * Reads a string field. Rejects non-strings so objects/arrays never reach SQL or the UI.
 * Returns undefined when the field is optional and missing.
 */
export function text(value, { field, min = 0, max, required = true, multiline = false, trim = true }) {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw badRequest(`${field} must be text`);
  let v = value.replace(multiline ? CONTROL_MULTI : CONTROL_SINGLE, '');
  if (trim) v = v.trim();
  if (v.length === 0 && min > 0) throw badRequest(`${field} is required`);
  if (v.length < min) throw badRequest(`${field} must be at least ${min} characters`);
  if (max !== undefined && v.length > max) throw badRequest(`${field} must be at most ${max} characters`);
  return v;
}

export function integer(value, { field, min, max, required = true }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${field} is required`);
    return undefined;
  }
  const n = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw badRequest(`${field} must be a whole number`);
  if (min !== undefined && n < min) throw badRequest(`${field} must be at least ${min}`);
  if (max !== undefined && n > max) throw badRequest(`${field} must be at most ${max}`);
  return n;
}

export function boolean(value, { field, required = true }) {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'boolean') throw badRequest(`${field} must be true or false`);
  return value;
}

/** Parses a route id like "12". Anything else is treated as "not found". */
export function idParam(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

export function body(req) {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}
