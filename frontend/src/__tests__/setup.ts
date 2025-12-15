import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/preact'
import { afterEach, beforeAll, afterAll, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers } from './mocks/handlers'

// Set up MSW server for mocking API calls
export const server = setupServer(...handlers)

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' })
})

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers()
  cleanup()
})

// Clean up after all tests
afterAll(() => {
  server.close()
})

// Mock window.matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(_url: string) {
    setTimeout(() => {
      if (this.onopen) this.onopen()
    }, 0)
  }

  send(_data: string) {}
  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose()
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)
