
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },

  testMatch: ['**/test/test.ts'],
  maxWorkers: 1,
  forceExit: true,
  testTimeout: 20000,
  verbose: true,
};