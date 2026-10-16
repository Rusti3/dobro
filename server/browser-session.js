import { createHash, randomBytes } from 'node:crypto';

export const BROWSER_SESSION_SECONDS = 180 * 86400;
export const sessionHash = token => createHash('sha256').update(token).digest('hex');
export const newSessionToken = () => randomBytes(32).toString('hex');

function secureRequest(req) {
  return Boolean(req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https');
}

export function browserCookieName(req) {
  return secureRequest(req) ? '__Host-helpi_session' : 'helpi_session';
}

export function readBrowserSession(req) {
  const name = browserCookieName(req);
  const values = (req.headers.cookie || '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(name + '=')).map(part => part.slice(name.length + 1));
  return values.length === 1 && /^[a-f0-9]{64}$/.test(values[0]) ? values[0] : null;
}

export function setBrowserSession(req, res, token) {
  res.setHeader('Set-Cookie', `${browserCookieName(req)}=${token || ''}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? BROWSER_SESSION_SECONDS : 0}${secureRequest(req) ? '; Secure' : ''}`);
}

// Bounded in-memory protection for anonymous requests; no IP addresses go to the DB.
export function requestLimiter({ limit, windowMs, maxBuckets = 20000 }) {
  const buckets = new Map();
  return (key, now = Date.now()) => {
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      if (buckets.size >= maxBuckets) {
        for (const [address, value] of buckets) if (now - value.start >= windowMs) buckets.delete(address);
        if (buckets.size >= maxBuckets && !buckets.has(key)) return false;
      }
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    return ++bucket.count <= limit;
  };
}
