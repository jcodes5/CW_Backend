import type { JestConfigWithTsJest } from 'ts-jest'

const config: JestConfigWithTsJest = {
  preset:           'ts-jest',
  testEnvironment:  'node',
  rootDir:          '.',
  testMatch:        ['**/tests/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  coverageDirectory:   'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/config/migrate.ts',
    '!src/config/seed.ts',
    '!src/server.ts',
  ],
  testTimeout: 15000,
  verbose:     true,
  globals: {
    'ts-jest': {
      tsconfig: {
        paths: { '@/*': ['src/*'] },
      },
    },
  },
}

export default config
