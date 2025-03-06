import { create } from 'zustand'

/**
 * Response Store
 * 
 * This file manages the global state for responses and generation context.
 * 
 * Main Features:
 * - Stores generated responses
 * - Maintains generation context
 * - Manages file and mode state
 * 
 * Dependencies:
 * - zustand: For state management
 * 
 * Side Effects:
 * - None (pure state management)
 * 
 * Connected Files:
 * - src/app/responses/page.js: Uses store for responses
 * - src/app/page.js: Sets initial responses
 * - src/app/openai.js: Uses context for generation
 */

const useResponseStore = create((set) => ({
  responses: [],
  lastFile: null,
  lastMode: null,
  lastContext: '',
  lastText: '',
  setResponses: (responses) => set({ responses }),
  setLastFile: (file) => set({ lastFile: file }),
  setLastMode: (mode) => set({ lastMode: mode }),
  setLastContext: (context) => set({ lastContext: context }),
  setLastText: (text) => set({ lastText: text }),
  clearAll: () => set({
    responses: [],
    lastFile: null,
    lastMode: null,
    lastContext: '',
    lastText: ''
  })
}))

export default useResponseStore 