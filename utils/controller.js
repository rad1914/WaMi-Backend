// @path: utils/controller.js

export function wrapController(fn, opts = {}) {
  const extractor =
    opts.input === 'query'   ? req => req.query
  : opts.input === 'body'    ? req => req.body
  : typeof opts.input === 'function'
    ? opts.input
    : req => (req.method === 'GET' ? req.query : req.body);

  return async (req, res) => {
    try {
      const input = extractor(req);
      const result = await fn(input, req);
      res.json(result);
    } catch (err) {
      res
        .status(err.status || 500)
        .json({
          error: err.message,
          ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
        });
    }
  };
}
