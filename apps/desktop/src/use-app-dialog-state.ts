import { useCallback, useState } from 'react'

export type AppDialog =
  'search' | 'archive' | 'settings' | 'notifications' | 'import' | 'help' | null

/** Keeps the application shell to one modal dialog and one focus trap at a time. */
export function useAppDialogState() {
  const [activeDialog, setActiveDialog] = useState<AppDialog>(null)
  const openDialog = useCallback((dialog: Exclude<AppDialog, null>) => setActiveDialog(dialog), [])
  const closeDialog = useCallback(() => setActiveDialog(null), [])

  return { activeDialog, openDialog, closeDialog }
}
