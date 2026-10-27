import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export function createRequestLogger(logger) {
  return pinoHttp({
    logger,

    genReqId(req, res) {
      const incoming = req.headers['x-request-id'];
      const id =
        typeof incoming === 'string' && SAFE_ID.test(incoming)
          ? incoming
          : randomUUID();

      res.setHeader('X-Request-Id', id);
      return id;
    },

    autoLogging: {
      ignore: (req) => req.url === '/api/health/live',
    },

    customLogLevel(req, res, err) {
      if (err || res.statusCode >= 500) {
        return 'error';
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },

    customProps(req) {
      return req.user ? { userId: req.user.id } : {};
    },

    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          path: (req.originalUrl ?? req.url).split('?')[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  });
}