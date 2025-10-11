import { defineNitroPlugin as _defineNitroPlugin } from 'nitropack/runtime/internal/plugin'

// Ensure defineNitroPlugin is available globally for all tests
;(globalThis as any).defineNitroPlugin = _defineNitroPlugin

// Define a dummy defineTask to avoid ReferenceError in tests
;(globalThis as any).defineTask = (task: any) => task


