import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Response Store
 * 
 * This file manages the global state for responses and generation context.
 * 
 * Main Features:
 * - Stores generated responses
 * - Maintains generation context
 * - Manages file and mode state
 * - Tracks current card position
 * 
 * Dependencies:
 * - zustand: For state management
 * - zustand/middleware: For state persistence
 * 
 * Side Effects:
 * - Persists state to localStorage
 * 
 * Connected Files:
 * - src/app/responses/page.js: Uses store for responses
 * - src/app/page.js: Sets initial responses
 * - src/app/openai.js: Uses context for generation
 */

const useResponseStore = create(
  persist(
    (set, get) => ({
      responses: [],
      lastFile: null,
      lastMode: null,
      lastContext: '',
      lastText: '',
      currentCardIndex: -1,
      setResponses: (responses) => 
        set({
          responses,
          currentCardIndex: responses.length - 1
        }),
      setLastFile: (file) => set({ lastFile: file }),
      setLastMode: (mode) => set({ lastMode: mode }),
      setLastContext: (context) => set({ lastContext: context }),
      setLastText: (text) => set({ lastText: text }),
      setCurrentCardIndex: (index) => set({ currentCardIndex: index }),
      clearAll: () => set({
        responses: [],
        lastFile: null,
        lastMode: null,
        lastContext: '',
        lastText: '',
        currentCardIndex: -1
      })
    }),
    {
      name: 'smoothrizz-store',
      version: 4,
      migrate: (persistedState, version) => {
        return {
          ...persistedState,
          currentCardIndex: persistedState.responses?.length 
            ? persistedState.responses.length - 1
            : -1
        };
      }
    }
  )
)

export default useResponseStore 