/**
 * jest.config.ts
 * Jest configuration for CashFlow402 backend tests.
 * Uses ts-jest in ESM mode to support TypeScript + ESM packages (cashscript, etc.)
 */

import type { JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  preset:                 'ts-jest/presets/default-esm',
  testEnvironment:        'node',
  extensionsToTreatAsEsm: ['.ts'],
  testMatch:              ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    // Strip .js extension from relative imports in TypeScript ESM files
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM:           true,
        tsconfig:         './tsconfig.json',
        diagnostics:      false,  // disable ts-jest type-check during tests for speed
      },
    ],
  },
  testTimeout: 30_000,   // 30s for tests that may touch slow async paths
};

export default config;
