import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { AttachmentProgressState } from '../EditorFloatingSurfaces'

type StoredAttachment = {
  hash: string
  size: number
  mimeType: string
  displayName: string
  url: string
  previewUrl: string | null
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error
    ? (error.message.split('Error: ').at(-1) ?? error.message)
    : fallback
}

/** Owns local attachment persistence, progress and drag state for one editor page. */
export function useEditorAttachments(pageId: string, updateCover: (cover: string) => void) {
  const [uploadState, setUploadState] = useState<AttachmentProgressState | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const uploadBusyRef = useRef(false)

  const reportProgress = (progress: { completed: number; total: number; currentName: string }) => {
    const percent = progress.total
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0
    setUploadState({
      phase: 'working',
      percent,
      name: progress.currentName,
      message: '正在校验并写入本地资源库',
    })
  }

  const insertStored = (
    editor: Editor,
    attachments: StoredAttachment[],
    forcedKind?: 'image' | 'file',
  ) => {
    const content = attachments.map((attachment) =>
      forcedKind === 'image' || (!forcedKind && attachment.mimeType.startsWith('image/'))
        ? {
            type: 'image',
            attrs: {
              src: attachment.url,
              previewSrc: attachment.previewUrl,
              alt: attachment.displayName,
              title: attachment.displayName,
            },
          }
        : {
            type: 'fileAttachment',
            attrs: {
              src: attachment.url,
              name: attachment.displayName,
              size: attachment.size,
              mimeType: attachment.mimeType,
            },
          },
    )
    editor.chain().focus().insertContent(content).run()
  }

  const pickAndInsert = async (editor: Editor, kind: 'image' | 'file') => {
    if (uploadBusyRef.current) return
    if (!window.notetodo?.attachments) {
      setUploadState({
        phase: 'error',
        percent: 0,
        name: '',
        message: '请在 NoteTodo 桌面应用中选择本地附件。',
      })
      return
    }
    uploadBusyRef.current = true
    setUploadState({ phase: 'working', percent: 0, name: '', message: '等待选择本地文件…' })
    try {
      const attachments = await window.notetodo.attachments.pickAndStore(
        pageId,
        kind,
        reportProgress,
      )
      if (!attachments.length) return setUploadState(null)
      insertStored(editor, attachments, kind)
      setUploadState({
        phase: 'complete',
        percent: 100,
        name: attachments.at(-1)?.displayName ?? '',
        message: `已插入 ${attachments.length} 个${kind === 'image' ? '图片' : '文件'}`,
      })
    } catch (error) {
      setUploadState({
        phase: 'error',
        percent: 0,
        name: '',
        message: errorMessage(error, '附件写入失败。'),
      })
    } finally {
      uploadBusyRef.current = false
    }
  }

  const pickCover = async () => {
    if (uploadBusyRef.current || !window.notetodo?.attachments) return
    uploadBusyRef.current = true
    setUploadState({ phase: 'working', percent: 0, name: '', message: '等待选择封面图片…' })
    try {
      const [cover] = await window.notetodo.attachments.pickAndStore(
        pageId,
        'image',
        reportProgress,
      )
      if (!cover) return setUploadState(null)
      updateCover(cover.url)
      setUploadState({
        phase: 'complete',
        percent: 100,
        name: cover.displayName,
        message: '页面封面已更新',
      })
    } catch (error) {
      setUploadState({
        phase: 'error',
        percent: 0,
        name: '',
        message: errorMessage(error, '封面写入失败。'),
      })
    } finally {
      uploadBusyRef.current = false
    }
  }

  const storeDropped = async (editor: Editor, files: File[]) => {
    if (uploadBusyRef.current || !files.length || !window.notetodo?.attachments) {
      setDropActive(false)
      return
    }
    uploadBusyRef.current = true
    setUploadState({
      phase: 'working',
      percent: 0,
      name: files[0]?.name ?? '',
      message: '正在接收拖放内容…',
    })
    try {
      const attachments = await window.notetodo.attachments.storeDropped(
        pageId,
        files,
        reportProgress,
      )
      if (!attachments.length) return setUploadState(null)
      insertStored(editor, attachments)
      setUploadState({
        phase: 'complete',
        percent: 100,
        name: attachments.at(-1)?.displayName ?? '',
        message: `已插入 ${attachments.length} 个附件`,
      })
    } catch (error) {
      setUploadState({
        phase: 'error',
        percent: 0,
        name: '',
        message: errorMessage(error, '附件写入失败。'),
      })
    } finally {
      uploadBusyRef.current = false
      setDropActive(false)
    }
  }

  useEffect(() => {
    if (!uploadState || uploadState.phase === 'working') return
    const timeout = window.setTimeout(
      () => setUploadState(null),
      uploadState.phase === 'complete' ? 3200 : 6500,
    )
    return () => window.clearTimeout(timeout)
  }, [uploadState?.phase, uploadState?.message])

  return { uploadState, dropActive, setDropActive, pickAndInsert, pickCover, storeDropped }
}
