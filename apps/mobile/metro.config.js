const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const enhanceMiddleware = config.server.enhanceMiddleware;

config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware, server) => {
  const enhancedMiddleware = enhanceMiddleware?.(middleware, server) ?? middleware;

  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    enhancedMiddleware(req, res, next);
  };
};

module.exports = config;
