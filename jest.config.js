/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: true,
  // Use a unique test DB per run to avoid conflicts
  globalSetup: undefined,
  // Run serially so DB state is predictable
  runInBand: true,
  // Clean up after each test file
  clearMocks: true,
};
