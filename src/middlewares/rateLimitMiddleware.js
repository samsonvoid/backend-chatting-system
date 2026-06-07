const ipRequestCounts = new Map();

// Clean up expired IP entries every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequestCounts.entries()) {
    if (now > data.resetTime) {
      ipRequestCounts.delete(ip);
    }
  }
}, 10 * 60 * 1000);

/**
 * Custom Rate Limiter Middleware
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} maxRequests - Max requests allowed per IP inside the window
 * @param {string} message - Error message to return when rate limit exceeded
 */
export function rateLimiter(windowMs = 15 * 60 * 1000, maxRequests = 100, message = 'Too many requests. Please try again later.') {
  return (req, res, next) => {
    // Read IP address (Clever Cloud/proxies pass true client IP in x-forwarded-for)
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    if (!ipRequestCounts.has(clientIp)) {
      ipRequestCounts.set(clientIp, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    const ipData = ipRequestCounts.get(clientIp);

    if (now > ipData.resetTime) {
      // Window expired, reset window and count
      ipData.count = 1;
      ipData.resetTime = now + windowMs;
      return next();
    }

    ipData.count++;

    if (ipData.count > maxRequests) {
      return res.status(429).json({
        success: false,
        message
      });
    }

    next();
  };
}
