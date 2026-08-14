import { useEffect, type Dispatch, type SetStateAction } from 'react'

const COMPACT_SHELL_QUERY = '(max-width: 900px)'

/** Frees the document canvas when the desktop window enters a compact width. */
export function useCompactShell(
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>,
  setAiOpen: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    const compactViewport = window.matchMedia(COMPACT_SHELL_QUERY)
    const enterCompactLayout = () => {
      if (!compactViewport.matches) return
      setSidebarCollapsed(true)
      setAiOpen(false)
    }

    enterCompactLayout()
    compactViewport.addEventListener('change', enterCompactLayout)
    return () => compactViewport.removeEventListener('change', enterCompactLayout)
  }, [setAiOpen, setSidebarCollapsed])
}
