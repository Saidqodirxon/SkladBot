/**
 * Rate Limiter Utility
 * Handles rate limiting for Telegram API to prevent hitting limits
 * Telegram allows 30 messages per second to different users
 */

class RateLimiter {
  constructor(maxPerSecond = 25) {
    // Set to 25 to be safe (below Telegram's 30/sec limit)
    this.maxPerSecond = maxPerSecond;
    this.queue = [];
    this.processing = false;
    this.sentInCurrentSecond = 0;
    this.currentSecondStart = Date.now();
  }

  /**
   * Add a task to the queue
   * @param {Function} task - Async function to execute
   * @returns {Promise} Promise that resolves when task completes
   */
  async schedule(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the queue with rate limiting
   */
  async processQueue() {
    if (this.processing) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.currentSecondStart;

      // Reset counter every second
      if (elapsed >= 1000) {
        this.sentInCurrentSecond = 0;
        this.currentSecondStart = now;
      }

      // If we've hit the limit, wait until next second
      if (this.sentInCurrentSecond >= this.maxPerSecond) {
        const waitTime = 1000 - elapsed;
        await this.sleep(waitTime);
        this.sentInCurrentSecond = 0;
        this.currentSecondStart = Date.now();
      }

      // Process next task
      const { task, resolve, reject } = this.queue.shift();

      try {
        const result = await task();
        this.sentInCurrentSecond++;
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // Small delay between messages to distribute load evenly
      await this.sleep(40); // 40ms = 25 messages per second
    }

    this.processing = false;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current queue size
   * @returns {number} Number of pending tasks
   */
  getQueueSize() {
    return this.queue.length;
  }

  /**
   * Clear the queue
   */
  clearQueue() {
    this.queue = [];
  }
}

// Export singleton instance
const rateLimiter = new RateLimiter(25);
export default rateLimiter;
