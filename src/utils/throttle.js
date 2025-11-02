/**
 * Throttle function - ensures callback is called at most once per specified delay
 * @param {Function} callback - Function to throttle
 * @param {number} delay - Delay in milliseconds (default 50ms)
 * @returns {Function} - Throttled function
 */
function throttle(callback, delay = 50) {
  let lastCall = 0;
  let timeoutId = null;

  return function throttled(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    const executeCallback = () => {
      lastCall = Date.now();
      callback(...args);
      timeoutId = null;
    };

    // Clear pending timeout if it exists
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (timeSinceLastCall >= delay) {
      // Enough time has passed - execute immediately
      executeCallback();
    } else {
      // Schedule for later
      timeoutId = setTimeout(executeCallback, delay - timeSinceLastCall);
    }
  };
}

module.exports = throttle;
