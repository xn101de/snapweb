import { defineConfig } from 'vitest/config'

// Standalone test config: the protocol code is pure (DataView / Text(En|De)coder),
// so tests run in the lightweight node environment without the PWA/react plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // config.ts reads window.location.host at import unless this is set;
    // providing it lets the pure protocol code import in the node env.
    env: { VITE_APP_SNAPSERVER_HOST: 'localhost:1780' },
  },
})
