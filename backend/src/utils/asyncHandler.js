/**
 * Wraps an async controller so a rejected promise is passed to Express's error
 * middleware instead of becoming an unhandled rejection.
 */
function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
