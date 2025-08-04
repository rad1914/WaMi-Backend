// @path: utils/controller.js
export function wrapController(fn, opts = {}) {

  const extractor = opts.input === 'query'
    ? req => req.query
    : opts.input === 'body'
    ? req => req.body
    : opts.input instanceof Function
    ? opts.input
    : req => (req.method === 'GET' ? req.query : req.body);

  return async (req, res) => {
    try {
      const input = extractor(req);
      const result = await fn(input, req);
      res.json(result);
    } catch (err) {
      const payload = { error: err.message };
      if (process.env.NODE_ENV === 'development') {
        payload.stack = err.stack;
      }
      res.status(500).json(payload);
    }
  };
}
