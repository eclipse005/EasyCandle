import { useReplayStore } from '@/store/replayStore'

/**
 * First-paint prefetch: the imported-dataset list for the management console.
 * The chart itself only loads when a backtesting session is opened.
 */
export async function runAppStartup(): Promise<void> {
  try {
    await useReplayStore.getState().refreshImportedList()
  } catch {
    // The console shows an empty dataset list on failure.
  }
}
