/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  watchman: false,
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  testMatch: [
    '**/tests/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 29.5,
      functions: 46,
      lines: 41.2,
      statements: 39.8,
    },
  },
  coverageDirectory: 'coverage',
  verbose: true,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
