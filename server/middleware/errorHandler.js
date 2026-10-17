function notFound(req, res, next) {
  res.status(404).json({ message: `Not found: ${req.originalUrl}` });
}
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  if (process.env.NODE_ENV !== 'test') {
    console.error('[error]', status, req.method, (req.originalUrl || req.url), '-', err.message);
  }
  const isServerError = status >= 500;
  const isDev = process.env.NODE_ENV === 'development';
  // NEVER leak an internal 5xx message (DB driver text, stack traces, host names)
  // to the client — log it server-side, return a generic message. Intentional
  // 4xx messages (validation, auth, not-found) are meant for the user, so keep
  // them. In development, surface the real message + stack for debugging.
  res.status(status).json({
    message: isServerError && !isDev ? 'Something went wrong on our end. Please try again.' : (err.message || 'Server error'),
    ...(err.code ? { code: err.code } : {}),
    ...(isDev ? { stack: err.stack } : {}),
  });
}
module.exports = { notFound, errorHandler };
