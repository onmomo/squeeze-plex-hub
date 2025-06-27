
import { defineNitroPlugin as _defineNitroPlugin } from 'nitropack/runtime/internal/plugin'


// Ensure defineNitroPlugin is available globally for all tests
(globalThis as any).defineNitroPlugin = _defineNitroPlugin
