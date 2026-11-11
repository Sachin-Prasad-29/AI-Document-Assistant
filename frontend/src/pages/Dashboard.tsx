import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, DragEvent, KeyboardEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import {
    getDocuments,
    getDocument,
    createDocument,
    uploadDocument,
    deleteDocument,
    summarizeDocument,
    sendChatMessage,
    resumeChat,
} from '../api'
import type { Document, ChatResponse, ApprovalRequest } from '../api'
import MarkdownMessage from '../components/MarkdownMessage'

interface DashboardProps {
    session: Session
}

// ---------- Local types ----------

interface Toast {
    id: number
    kind: 'success' | 'error'
    title: string
    message: string
}

interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    text: string | null
    toolsUsed: string[]
    approval: ApprovalRequest | null
    approvalResolved: 'approved' | 'rejected' | null
    time: string
}

// ---------- Helpers ----------

const errorMessage = (err: unknown): string => {
    if (err && typeof err === 'object') {
        const anyErr = err as { response?: { data?: { detail?: unknown; message?: unknown } }; message?: unknown }
        const detail = anyErr.response?.data?.detail ?? anyErr.response?.data?.message
        if (typeof detail === 'string') return detail
        if (Array.isArray(detail)) return detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d))).join(', ')
        if (typeof anyErr.message === 'string') return anyErr.message
    }
    return 'Something went wrong'
}

const nowTime = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const fileExt = (doc: Document): string => {
    const name = doc.filename || doc.title || ''
    const m = name.match(/\.([a-zA-Z0-9]+)$/)
    return (m?.[1] ?? 'txt').toUpperCase()
}

const timeAgo = (iso: string): string => {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const diff = Date.now() - then
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })

type StatusKind = 'ready' | 'processing' | 'failed' | 'unknown'

const statusKind = (status: string): StatusKind => {
    const s = (status || '').toLowerCase()
    if (/(ready|complete|indexed|done|success|active)/.test(s)) return 'ready'
    if (/(fail|error)/.test(s)) return 'failed'
    if (/(process|embed|index|pending|queued|running|chunk)/.test(s)) return 'processing'
    return 'unknown'
}

const extBadgeClass = (ext: string): string => {
    switch (ext) {
        case 'PDF':
            return 'bg-error-container text-on-error-container'
        case 'MD':
            return 'bg-secondary-container text-on-secondary-container'
        default:
            return 'bg-surface-variant text-on-surface-variant'
    }
}

const SUGGESTIONS = [
    'What documents do I have?',
    'Summarize my latest document',
    'How many casual leaves can an employee take?',
]

// ============================================================
// Small presentational pieces
// ============================================================

function StatusPill({ status }: { status: string }) {
    const kind = statusKind(status)
    if (kind === 'ready') {
        return (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-tertiary-container/30 text-tertiary">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider">Ready</span>
            </div>
        )
    }
    if (kind === 'processing') {
        return (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-variant text-secondary">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-ping" />
                <span className="font-label-sm text-label-sm font-semibold">Processing</span>
            </div>
        )
    }
    if (kind === 'failed') {
        return (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-error-container/30 text-error">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span className="font-label-sm text-label-sm font-semibold">Failed</span>
            </div>
        )
    }
    return (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant">
            <span className="w-1.5 h-1.5 rounded-full bg-outline" />
            <span className="font-label-sm text-label-sm font-semibold">{status}</span>
        </div>
    )
}

interface DocCardProps {
    doc: Document
    onOpen: (doc: Document) => void
    onDelete: (doc: Document) => void
}

function DocumentCard({ doc, onOpen, onDelete }: DocCardProps) {
    const ext = fileExt(doc)
    const name = doc.filename || doc.title
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(doc)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpen(doc)
                }
            }}
            className="group relative p-3 rounded-xl bg-surface-container shadow-md transition-all flex flex-col justify-between hover:bg-surface-container-high cursor-pointer text-left"
        >
            <div>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded font-label-sm text-label-sm font-bold shrink-0 ${extBadgeClass(ext)}`}>
                            {ext}
                        </span>
                        <span
                            className="font-body-sm text-body-sm text-on-surface font-semibold truncate group-hover:text-primary transition-colors"
                            title={name}
                        >
                            {name}
                        </span>
                    </div>
                    <button
                        className="text-outline hover:text-error hover:bg-error-container/20 transition-all p-1 rounded shrink-0"
                        title="Delete document"
                        aria-label={`Delete ${name}`}
                        onClick={(e) => {
                            e.stopPropagation()
                            onDelete(doc)
                        }}
                    >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
                <p className="font-label-sm text-label-sm text-outline mt-1.5 truncate" title={doc.title}>
                    {doc.title} · {timeAgo(doc.created_at)}
                </p>
            </div>
            <div className="mt-3 pt-2 border-t border-outline-variant/30 flex items-center justify-between gap-2">
                <StatusPill status={doc.status} />
                <span className="font-label-sm text-label-sm text-outline">{doc.num_chunks} chunks</span>
            </div>
        </div>
    )
}

// ============================================================
// Main Dashboard
// ============================================================

function Dashboard({ session }: DashboardProps) {
    const user = session.user
    const displayName =
        (user.user_metadata?.full_name as string | undefined) || user.email || 'User'
    const userRole = (user.user_metadata?.role as string | undefined) || null

    // ----- Documents state -----
    const [documents, setDocuments] = useState<Document[]>([])
    const [docsLoading, setDocsLoading] = useState(true)
    const [filter, setFilter] = useState('')
    const [uploading, setUploading] = useState(false)
    const [dragging, setDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ----- Create document dialog -----
    const [createOpen, setCreateOpen] = useState(false)
    const [createTitle, setCreateTitle] = useState('')
    const [createContent, setCreateContent] = useState('')
    const [createSubmitting, setCreateSubmitting] = useState(false)

    // ----- Detail dialog -----
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    const [summarizing, setSummarizing] = useState(false)

    // ----- Delete dialog -----
    const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
    const [deleting, setDeleting] = useState(false)

    // ----- Chat state -----
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [threadId, setThreadId] = useState<string | null>(null)
    const [chatInput, setChatInput] = useState('')
    const [chatLoading, setChatLoading] = useState(false)
    const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // ----- Toasts -----
    const [toasts, setToasts] = useState<Toast[]>([])
    const toastId = useRef(0)

    // ----- Sign out / chrome -----
    const [signingOut, setSigningOut] = useState(false)
    const [docsPanelOpen, setDocsPanelOpen] = useState(true)

    const addToast = useCallback((kind: Toast['kind'], title: string, message: string) => {
        const id = ++toastId.current
        setToasts((t) => [...t, { id, kind, title, message }])
        window.setTimeout(() => {
            setToasts((t) => t.filter((toast) => toast.id !== id))
        }, 4500)
    }, [])

    // ----- Load documents -----
    const loadDocuments = useCallback(async (showSpinner = true) => {
        if (showSpinner) setDocsLoading(true)
        try {
            const docs = await getDocuments()
            setDocuments(docs)
        } catch (err) {
            addToast('error', 'Failed to load documents', errorMessage(err))
        } finally {
            setDocsLoading(false)
        }
    }, [addToast])

    useEffect(() => {
        void loadDocuments()
    }, [loadDocuments])

    // ----- Auto scroll chat -----
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages, chatLoading])

    // ----- Sign out -----
    const handleSignOut = async () => {
        setSigningOut(true)
        try {
            await supabase.auth.signOut()
            // onAuthStateChange in App.tsx clears the session and redirects to /auth
        } finally {
            setSigningOut(false)
        }
    }

    // ----- Filtered documents -----
    const visibleDocuments = useMemo(() => {
        const q = filter.trim().toLowerCase()
        if (!q) return documents
        return documents.filter((d) =>
            [d.title, d.filename ?? ''].some((v) => v.toLowerCase().includes(q)),
        )
    }, [documents, filter])

    // ----- Upload -----
    const handleUploadFile = async (file: File) => {
        setUploading(true)
        try {
            const doc = await uploadDocument(file)
            setDocuments((ds) => [doc, ...ds])
            addToast('success', 'Document indexed', `'${doc.filename || doc.title}' is ready for querying.`)
        } catch (err) {
            addToast('error', 'Upload failed', errorMessage(err))
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) void handleUploadFile(file)
    }

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) void handleUploadFile(file)
    }

    // ----- Create custom document -----
    const wordCount = useMemo(
        () => (createContent.trim() ? createContent.trim().split(/\s+/).length : 0),
        [createContent],
    )

    const submitCreate = async () => {
        const title = createTitle.trim()
        const content = createContent.trim()
        if (!title || !content) {
            addToast('error', 'Missing fields', 'A title and content are required.')
            return
        }
        setCreateSubmitting(true)
        try {
            const doc = await createDocument({ title, content })
            setDocuments((ds) => [doc, ...ds])
            setCreateOpen(false)
            setCreateTitle('')
            setCreateContent('')
            addToast('success', 'Document created', `'${doc.title}' is being indexed.`)
        } catch (err) {
            addToast('error', 'Create failed', errorMessage(err))
        } finally {
            setCreateSubmitting(false)
        }
    }

    // ----- Detail dialog -----
    const openDetail = async (doc: Document) => {
        setSelectedId(doc.id)
        setSelectedDoc(doc) // show cached data immediately
        setDetailLoading(true)
        try {
            const fresh = await getDocument(doc.id)
            setSelectedDoc(fresh)
            setDocuments((ds) => ds.map((d) => (d.id === fresh.id ? fresh : d)))
        } catch (err) {
            addToast('error', 'Failed to load document', errorMessage(err))
            setSelectedId(null)
            setSelectedDoc(null)
        } finally {
            setDetailLoading(false)
        }
    }

    const generateSummary = async (force: boolean) => {
        if (!selectedDoc) return
        setSummarizing(true)
        try {
            const res = await summarizeDocument(selectedDoc.id, force)
            setSelectedDoc((d) => (d ? { ...d, summary: res.summary } : d))
            setDocuments((ds) =>
                ds.map((d) => (d.id === res.document_id ? { ...d, summary: res.summary } : d)),
            )
            addToast('success', 'Summary ready', 'AI summary generated for this document.')
        } catch (err) {
            addToast('error', 'Summarize failed', errorMessage(err))
        } finally {
            setSummarizing(false)
        }
    }

    // ----- Delete flow -----
    const confirmDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            await deleteDocument(deleteTarget.id)
            setDocuments((ds) => ds.filter((d) => d.id !== deleteTarget.id))
            if (selectedId === deleteTarget.id) {
                setSelectedId(null)
                setSelectedDoc(null)
            }
            addToast('success', 'Document deleted', `'${deleteTarget.filename || deleteTarget.title}' was removed.`)
            setDeleteTarget(null)
        } catch (err) {
            addToast('error', 'Delete failed', errorMessage(err))
        } finally {
            setDeleting(false)
        }
    }

    // ----- Chat -----
    const assistantMessageFrom = (res: ChatResponse): ChatMessage => ({
        id: crypto.randomUUID(),
        role: 'assistant',
        text: res.answer,
        toolsUsed: res.tools_used ?? [],
        approval: res.status === 'awaiting_approval' ? res.approval_request : null,
        approvalResolved: null,
        time: nowTime(),
    })

    const sendMessage = async (raw: string) => {
        const text = raw.trim()
        if (!text || chatLoading) return
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            text,
            toolsUsed: [],
            approval: null,
            approvalResolved: null,
            time: nowTime(),
        }
        setMessages((m) => [...m, userMsg])
        setChatInput('')
        setChatLoading(true)
        try {
            const res = await sendChatMessage(text, threadId)
            setThreadId(res.thread_id)
            setMessages((m) => [...m, assistantMessageFrom(res)])
        } catch (err) {
            addToast('error', 'Chat failed', errorMessage(err))
        } finally {
            setChatLoading(false)
        }
    }

    const resolveApproval = async (messageId: string, approved: boolean) => {
        if (!threadId) return
        setResolvingApprovalId(messageId)
        try {
            const res = await resumeChat(threadId, approved)
            setThreadId(res.thread_id)
            setMessages((m) =>
                m.map((msg) =>
                    msg.id === messageId
                        ? { ...msg, approvalResolved: approved ? 'approved' : 'rejected' }
                        : msg,
                ),
            )
            setMessages((m) => [...m, assistantMessageFrom(res)])
            // An approved action may have mutated the document set — refresh it
            if (approved) await loadDocuments(false)
        } catch (err) {
            addToast('error', 'Approval failed', errorMessage(err))
        } finally {
            setResolvingApprovalId(null)
        }
    }

    const startNewChat = () => {
        setMessages([])
        setThreadId(null)
        setChatInput('')
    }

    const onChatKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void sendMessage(chatInput)
        }
    }

    const submitChatForm = (e: FormEvent) => {
        e.preventDefault()
        void sendMessage(chatInput)
    }

    const awaitingApproval = messages.some((m) => m.approval && !m.approvalResolved)

    // ============================================================
    // Render
    // ============================================================

    return (
        <div className="h-screen flex flex-col bg-background text-on-surface font-body-md overflow-hidden">
            {/* ============ TOP HEADER ============ */}
            <header className="h-16 shrink-0 bg-surface-container-lowest/80 backdrop-blur-xl z-50 shadow-[0_1px_8px_rgba(0,0,0,0.4)] flex items-center">
                <div className="h-16 w-full px-gutter flex items-center justify-between gap-space-md">
                    <div className="flex items-center gap-space-sm">
                        <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center shadow-md">
                            <span className="material-symbols-outlined text-on-primary-container text-[20px]">auto_awesome</span>
                        </div>
                        <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-surface">DocMind</span>
                        <span className="font-label-sm text-label-sm uppercase px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-semibold tracking-wider">AI</span>
                    </div>
                    <div className="flex items-center gap-space-sm pl-space-sm py-1 pr-space-md rounded-full bg-surface-container-low">
                        <div className="relative flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center">
                                <span className="font-headline-sm text-headline-sm text-primary font-semibold">
                                    {displayName.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-tertiary-container ring-2 ring-surface-container-low" title="Active" />
                        </div>
                        <div className="hidden sm:flex flex-col text-left min-w-0">
                            <div className="flex items-center gap-space-xs">
                                <span className="font-body-sm text-body-sm font-medium text-on-surface truncate max-w-[180px]">{displayName}</span>
                                {userRole && (
                                    <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium capitalize">{userRole}</span>
                                )}
                            </div>
                            <span className="font-label-sm text-label-sm text-outline truncate max-w-[200px]">{user.email}</span>
                        </div>
                        <button
                            className="flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant hover:text-error transition-colors pl-space-xs disabled:opacity-60"
                            onClick={handleSignOut}
                            disabled={signingOut}
                            title="Log out"
                        >
                            <span className="material-symbols-outlined text-[18px]">logout</span>
                            <span className="hidden md:inline font-body-sm text-body-sm">{signingOut ? 'Signing out…' : 'Log out'}</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* ============ SUB-HEADER / ACTION RIBBON ============ */}
            <div className="shrink-0 w-full px-gutter py-space-sm bg-surface-container-lowest/60 backdrop-blur-md flex items-center justify-between gap-space-md border-b border-outline-variant/20">
                <div className="flex items-center gap-space-sm min-w-0">
                    <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-primary text-[20px]">folder_special</span>
                        <span className="font-headline-sm text-headline-sm text-on-surface truncate">Workspace</span>
                    </div>
                    <span className="font-label-sm text-label-sm uppercase px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-semibold">Active Session</span>
                </div>
                <div className="flex items-center gap-space-sm shrink-0">
                    <div className="hidden lg:flex items-center gap-space-xs px-2.5 py-1 rounded-lg bg-surface-container-low text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px] text-tertiary">database</span>
                        <span className="font-label-sm text-label-sm font-medium">{documents.length} Doc{documents.length === 1 ? '' : 's'} indexed</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary ml-1 animate-pulse" />
                    </div>
                    <button
                        className="lg:hidden flex items-center p-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high"
                        id="mobile-sidebar-toggle"
                        onClick={() => setDocsPanelOpen((v) => !v)}
                        title="Toggle documents panel"
                        aria-label="Toggle documents panel"
                    >
                        <span className="material-symbols-outlined text-[20px]">dock_to_right</span>
                    </button>
                </div>
            </div>

            {/* ============ DUAL COLUMN LAYOUT ============ */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative">
                {/* Ambient glow backdrop */}
                <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none -z-10" />
                <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-tertiary-container/10 rounded-full blur-3xl pointer-events-none -z-10" />

                {/* ===== LEFT: DOCUMENTS PANEL ===== */}
                <section
                    className={`${docsPanelOpen ? 'flex' : 'hidden'} lg:flex w-full shrink-0 bg-surface-container-low/95 backdrop-blur-xl flex-col transition-all duration-300 z-20 lg:w-1/2 lg:min-h-0 border-r border-outline-variant/20`}
                    id="doc-sidebar"
                >
                    {/* Panel header */}
                    <div className="p-space-md pb-space-sm flex items-center justify-between">
                        <div className="flex items-center gap-space-xs">
                            <span className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Documents</span>
                            <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-primary font-label-sm text-label-sm font-bold">{documents.length}</span>
                        </div>
                        <button
                            className="text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
                            title="Refresh documents"
                            aria-label="Refresh documents"
                            onClick={() => void loadDocuments()}
                            disabled={docsLoading}
                        >
                            <span className={`material-symbols-outlined text-[18px] ${docsLoading ? 'animate-spin' : ''}`}>sync</span>
                        </button>
                    </div>

                    {/* Action buttons + upload zone */}
                    <div className="px-space-md flex flex-col gap-space-sm">
                        <div className="grid grid-cols-2 gap-2 w-full">
                            <button
                                className="py-2 px-3 rounded-lg bg-primary-container hover:bg-inverse-primary text-on-primary-container font-body-sm text-body-sm font-semibold flex items-center justify-center gap-1.5 shadow-md transition-all disabled:opacity-60"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                <span>{uploading ? 'Uploading…' : 'Upload file'}</span>
                            </button>
                            <button
                                id="open-custom-doc-btn"
                                className="py-2 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface font-body-sm text-body-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all hover:text-primary"
                                onClick={() => setCreateOpen(true)}
                            >
                                <span className="material-symbols-outlined text-[18px] text-primary">edit_note</span>
                                <span>Write / Paste</span>
                            </button>
                        </div>

                        {/* Hidden file input + drop zone */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.txt,.md,.markdown,.doc,.docx"
                            className="hidden"
                            onChange={onFileInputChange}
                        />
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label="Upload a document file"
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    fileInputRef.current?.click()
                                }
                            }}
                            onDragOver={(e) => {
                                e.preventDefault()
                                setDragging(true)
                            }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDrop}
                            className={`relative group p-space-md rounded-xl transition-all text-center flex flex-col items-center justify-center cursor-pointer border border-dashed ${dragging
                                    ? 'bg-surface-container border-primary shadow-lg'
                                    : 'bg-surface-container/60 border-transparent hover:bg-surface-container hover:shadow-lg'
                                }`}
                        >
                            <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-primary text-[22px]">
                                    {uploading ? 'progress_activity' : 'cloud_upload'}
                                </span>
                            </div>
                            <span className="font-body-sm text-body-sm text-on-surface font-medium">
                                {uploading ? 'Uploading & indexing…' : 'Drag & drop files here'}
                            </span>
                            <span className="font-label-sm text-label-sm text-outline mt-0.5">PDF, TXT, MD supported</span>
                            <div className="mt-2 text-primary font-label-sm text-label-sm underline underline-offset-2">Browse computer</div>
                        </div>

                        {/* Filter search bar */}
                        <div className="relative mt-1">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-outline text-[18px]">search</span>
                            <input
                                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-sm text-body-sm outline-none focus:bg-surface-container-high transition-all"
                                placeholder="Filter documents..."
                                type="text"
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                aria-label="Filter documents"
                            />
                        </div>
                    </div>

                    {/* Document list (scrollable) */}
                    <div className="p-space-md flex-1 min-h-0 flex flex-col gap-space-sm overflow-y-auto max-h-96 lg:max-h-none">
                        {docsLoading && documents.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3 text-outline">
                                <span className="material-symbols-outlined text-[36px] animate-spin">progress_activity</span>
                                <span className="font-body-sm text-body-sm">Loading documents…</span>
                            </div>
                        ) : visibleDocuments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                                <span className="material-symbols-outlined text-[40px] text-outline">description</span>
                                <p className="font-body-md text-body-md text-on-surface-variant">
                                    {filter.trim() ? 'No documents match your filter.' : 'No documents yet.'}
                                </p>
                                {!filter.trim() && (
                                    <p className="font-body-sm text-body-sm text-outline max-w-[240px]">Upload a file or write one to start building your knowledge base.</p>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                                {visibleDocuments.map((doc) => (
                                    <DocumentCard key={doc.id} doc={doc} onOpen={openDetail} onDelete={setDeleteTarget} />
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                {/* ===== RIGHT: CHAT PANEL ===== */}
                <main className="flex flex-col bg-surface flex-1 min-h-[70vh] lg:min-h-0 relative lg:w-1/2">
                    {/* Chat sub-header */}
                    <div className="px-gutter py-space-sm bg-surface-container-lowest/40 backdrop-blur-md flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-space-sm">
                            <div className="relative flex items-center justify-center">
                                <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                                    <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                                </div>
                                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-tertiary ring-2 ring-surface" />
                            </div>
                            <div>
                                <div className="flex items-center gap-space-xs">
                                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">AI Assistant</span>
                                    <span className="font-label-sm text-label-sm text-tertiary">Online</span>
                                </div>
                                <div className="flex items-center gap-1 font-label-sm text-label-sm text-outline">
                                    <span>Model:</span>
                                    <span className="text-primary font-medium">DocMind Document Engine</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-space-xs">
                            <button
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-all font-body-sm text-body-sm"
                                onClick={startNewChat}
                                title="Start a new conversation"
                            >
                                <span className="material-symbols-outlined text-[16px]">add</span>
                                <span className="hidden sm:inline">New chat</span>
                            </button>
                        </div>
                    </div>

                    {/* Message stream */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-gutter flex flex-col gap-space-lg">
                        {messages.length === 0 && !chatLoading && (
                            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-10">
                                <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center shadow-md">
                                    <span className="material-symbols-outlined text-primary text-[32px]">auto_awesome</span>
                                </div>
                                <div>
                                    <p className="font-headline-md text-headline-md text-on-surface font-semibold">Ask anything about your documents</p>
                                    <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-md">DocMind searches your indexed documents, cites sources, and can take actions — with your approval first.</p>
                                </div>
                            </div>
                        )}

                        {messages.map((msg) =>
                            msg.role === 'user' ? (
                                <div key={msg.id} className="flex justify-end items-end gap-space-sm max-w-2xl ml-auto">
                                    <div className="p-space-md rounded-2xl rounded-br-sm bg-secondary-container text-on-secondary-container shadow-md">
                                        <p className="font-body-md text-body-md leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                        <span className="block mt-1 font-label-sm text-label-sm text-secondary-fixed-dim text-right">{msg.time}</span>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-primary text-[18px]">person</span>
                                    </div>
                                </div>
                            ) : (
                                <div key={msg.id} className="flex items-start gap-space-sm max-w-3xl mr-auto">
                                    <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 shadow-sm">
                                        <span className="material-symbols-outlined text-primary text-[18px]">
                                            {msg.approval ? 'shield' : 'auto_awesome'}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col gap-space-sm">
                                        {/* Tool invocation chips */}
                                        {msg.toolsUsed.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {msg.toolsUsed.map((tool, i) => (
                                                    <span
                                                        key={`${tool}-${i}`}
                                                        className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container-lowest text-tertiary font-mono flex items-center gap-1"
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                                        {tool}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Answer bubble */}
                                        {msg.text && (
                                            <div className="p-space-md rounded-2xl rounded-tl-sm bg-surface-container shadow-md">
                                                <MarkdownMessage text={msg.text} />
                                                <span className="block mt-1 font-label-sm text-label-sm text-outline text-right">{msg.time}</span>
                                            </div>
                                        )}

                                        {/* Approval guardrail card */}
                                        {msg.approval && (
                                            <div className="p-space-md rounded-2xl rounded-tl-sm bg-surface-container-high shadow-xl flex flex-col gap-space-sm border border-outline-variant/30">
                                                <div className="flex items-center gap-2 text-secondary">
                                                    <span className="material-symbols-outlined text-[20px]">warning</span>
                                                    <span className="font-headline-sm text-headline-sm font-semibold">Waiting for your approval</span>
                                                </div>
                                                <p className="font-body-md text-body-md text-on-surface leading-relaxed">{msg.approval.message}</p>
                                                <div className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-outline">
                                                    <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-secondary font-mono">{msg.approval.action}</span>
                                                    {msg.approval.title && (
                                                        <span className="px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface-variant font-mono">{msg.approval.title}</span>
                                                    )}
                                                </div>
                                                {msg.approvalResolved ? (
                                                    <div className="pt-1 flex items-center gap-1.5 font-body-sm text-body-sm font-semibold">
                                                        <span className={`material-symbols-outlined text-[18px] ${msg.approvalResolved === 'approved' ? 'text-tertiary' : 'text-error'}`}>
                                                            {msg.approvalResolved === 'approved' ? 'check_circle' : 'cancel'}
                                                        </span>
                                                        <span className={msg.approvalResolved === 'approved' ? 'text-tertiary' : 'text-error'}>
                                                            {msg.approvalResolved === 'approved' ? 'Approved' : 'Rejected'}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="pt-1 flex items-center gap-space-sm">
                                                        <button
                                                            id="inline-confirm-action"
                                                            className="px-4 py-1.5 rounded-lg bg-error hover:bg-error-container text-on-error font-body-sm text-body-sm font-semibold transition-all shadow-md disabled:opacity-60"
                                                            onClick={() => void resolveApproval(msg.id, true)}
                                                            disabled={resolvingApprovalId === msg.id}
                                                        >
                                                            {resolvingApprovalId === msg.id
                                                                ? 'Approving…'
                                                                : msg.approval.action.toLowerCase().includes('delete')
                                                                    ? 'Confirm Deletion'
                                                                    : 'Approve'}
                                                        </button>
                                                        <button
                                                            className="px-4 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface transition-all font-body-sm text-body-sm disabled:opacity-60"
                                                            onClick={() => void resolveApproval(msg.id, false)}
                                                            disabled={resolvingApprovalId === msg.id}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ),
                        )}

                        {/* Typing indicator */}
                        {chatLoading && (
                            <div className="flex items-center gap-space-sm text-outline font-label-sm text-label-sm pl-11">
                                <div className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
                                </div>
                                <span>DocMind is thinking…</span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick suggestion chips */}
                    <div className="px-gutter pb-space-xs flex items-center gap-space-xs overflow-x-auto no-scrollbar shrink-0">
                        {SUGGESTIONS.map((s) => (
                            <button
                                key={s}
                                className="shrink-0 px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-all shadow-sm disabled:opacity-50"
                                onClick={() => void sendMessage(s)}
                                disabled={chatLoading || awaitingApproval}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    {/* Floating prompt input dock */}
                    <div className="p-gutter pt-space-xs bg-gradient-to-t from-surface via-surface to-transparent shrink-0">
                        <form onSubmit={submitChatForm} className="p-1.5 rounded-2xl bg-surface-container-low shadow-2xl flex items-center gap-2">
                            <input
                                className="flex-1 bg-transparent px-2 py-2 text-on-surface placeholder:text-outline font-body-md text-body-md outline-none min-w-0"
                                placeholder={awaitingApproval ? 'Approve or cancel the pending action first…' : 'Ask anything about your documents... (Press Enter to send)'}
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={onChatKeyDown}
                                aria-label="Chat message"
                            />
                            <button
                                type="submit"
                                className="w-10 h-10 rounded-xl bg-primary-container hover:bg-inverse-primary text-on-primary-container flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                disabled={chatLoading || !chatInput.trim()}
                                aria-label="Send message"
                            >
                                <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
                            </button>
                        </form>
                    </div>
                </main>
            </div>

            {/* ============ CREATE DOCUMENT MODAL ============ */}
            {createOpen && (
                <div
                    className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-md flex items-center justify-center p-gutter"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Create custom document"
                    onClick={() => setCreateOpen(false)}
                >
                    <div
                        className="w-full max-w-2xl bg-surface-container-high rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-outline-variant/30 max-h-[92vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-space-lg bg-surface-container-highest/60 flex items-start justify-between border-b border-outline-variant/30">
                            <div className="flex items-center gap-space-md">
                                <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary shadow-sm">
                                    <span className="material-symbols-outlined text-[28px]">note_add</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-space-xs flex-wrap">
                                        <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">Create Custom Document</h3>
                                        <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-primary-container/20 text-primary font-bold">Text Ingestion</span>
                                    </div>
                                    <p className="font-label-sm text-label-sm text-outline mt-1">Write or paste notes — they are chunked and embedded automatically</p>
                                </div>
                            </div>
                            <button className="text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors" id="close-custom-doc-btn" onClick={() => setCreateOpen(false)} aria-label="Close">
                                <span className="material-symbols-outlined text-[22px]">close</span>
                            </button>
                        </div>
                        <div className="p-space-lg flex flex-col gap-space-md overflow-y-auto">
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="custom-doc-title" className="font-body-sm text-body-sm font-medium text-on-surface flex items-center justify-between">
                                    <span>Document Title</span>
                                    <span className="font-label-sm text-label-sm text-outline">Required</span>
                                </label>
                                <div className="relative flex items-center">
                                    <span className="material-symbols-outlined absolute left-3 text-outline text-[18px]">title</span>
                                    <input
                                        id="custom-doc-title"
                                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-outline font-body-sm text-body-sm outline-none focus:bg-surface-container-high transition-all border border-outline-variant/30 focus:border-primary"
                                        placeholder="e.g., team_retrospective_notes or Company Handbook Summary"
                                        type="text"
                                        value={createTitle}
                                        onChange={(e) => setCreateTitle(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="custom-doc-body" className="font-body-sm text-body-sm font-medium text-on-surface">Document Content</label>
                                    <span className="font-label-sm text-label-sm text-outline">{createContent.length} characters · ~{wordCount} words</span>
                                </div>
                                <textarea
                                    id="custom-doc-body"
                                    className="w-full h-44 p-3 rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-outline font-mono text-[13px] leading-relaxed outline-none border border-outline-variant/30 focus:border-primary transition-all resize-none"
                                    placeholder="Paste plain text, meeting notes, markdown policy, or draft content here..."
                                    value={createContent}
                                    onChange={(e) => setCreateContent(e.target.value)}
                                />
                            </div>
                            <div className="p-space-sm rounded-xl bg-surface-container-lowest/60 border border-outline-variant/30 flex items-center gap-space-sm">
                                <span className="material-symbols-outlined text-tertiary text-[20px] shrink-0">auto_fix_high</span>
                                <p className="font-label-sm text-label-sm text-outline">DocMind will automatically partition this text into chunk embeddings upon submission.</p>
                            </div>
                        </div>
                        <div className="p-space-md bg-surface-container-lowest/60 flex items-center justify-between gap-space-sm border-t border-outline-variant/30">
                            <button className="px-4 py-2 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-all" id="cancel-custom-doc-btn" onClick={() => setCreateOpen(false)}>
                                Cancel
                            </button>
                            <button
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-headline-sm text-headline-sm font-semibold hover:bg-inverse-primary transition-all shadow-md disabled:opacity-60"
                                id="submit-custom-doc-btn"
                                onClick={() => void submitCreate()}
                                disabled={createSubmitting}
                            >
                                <span className="material-symbols-outlined text-[18px]">{createSubmitting ? 'progress_activity' : 'magic_button'}</span>
                                <span>{createSubmitting ? 'Indexing…' : 'Save & Index document'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ DOCUMENT DETAIL / SUMMARY MODAL ============ */}
            {selectedId && (
                <div
                    className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-md flex items-center justify-center p-gutter"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Document details"
                    onClick={() => {
                        setSelectedId(null)
                        setSelectedDoc(null)
                    }}
                >
                    <div
                        className="w-full max-w-2xl bg-surface-container-high rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-outline-variant/30 max-h-[92vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-space-lg bg-surface-container-highest/60 flex items-start justify-between border-b border-outline-variant/30">
                            <div className="flex items-center gap-space-md min-w-0">
                                <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary shadow-sm shrink-0">
                                    <span className="material-symbols-outlined text-[28px]">description</span>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-space-xs flex-wrap">
                                        <h3 className="font-headline-md text-headline-md text-on-surface font-semibold break-all">
                                            {selectedDoc?.filename || selectedDoc?.title || 'Document'}
                                        </h3>
                                        {selectedDoc && (
                                            <span className={`font-label-sm text-label-sm px-2 py-0.5 rounded font-bold ${extBadgeClass(fileExt(selectedDoc))}`}>
                                                {fileExt(selectedDoc)}
                                            </span>
                                        )}
                                    </div>
                                    {selectedDoc && (
                                        <p className="font-label-sm text-label-sm text-outline mt-1">
                                            Title: {selectedDoc.title} · Uploaded {formatDate(selectedDoc.created_at)} · {selectedDoc.num_chunks} chunks
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button className="text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container transition-colors shrink-0" id="close-summary-btn" onClick={() => { setSelectedId(null); setSelectedDoc(null) }} aria-label="Close">
                                <span className="material-symbols-outlined text-[22px]">close</span>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-space-lg flex flex-col gap-space-md overflow-y-auto">
                            {detailLoading && !selectedDoc && (
                                <div className="flex flex-col items-center py-10 gap-3 text-outline">
                                    <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
                                    <span className="font-body-sm text-body-sm">Loading document…</span>
                                </div>
                            )}

                            {selectedDoc && (
                                <>
                                    <div className="flex items-center gap-space-sm flex-wrap">
                                        <StatusPill status={selectedDoc.status} />
                                        {statusKind(selectedDoc.status) === 'failed' && selectedDoc.error && (
                                            <span className="font-body-sm text-body-sm text-error">{selectedDoc.error}</span>
                                        )}
                                    </div>

                                    <div>
                                        <span className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">Executive Summary &amp; AI Key Insights</span>
                                        {detailLoading ? (
                                            <div className="space-y-2 pt-3">
                                                <div className="w-full bg-surface-container h-3 rounded-full overflow-hidden"><div className="bg-surface-variant h-full w-4/5 animate-pulse" /></div>
                                                <div className="w-2/3 bg-surface-container h-3 rounded-full overflow-hidden"><div className="bg-surface-variant h-full w-1/2 animate-pulse" /></div>
                                            </div>
                                        ) : selectedDoc.summary ? (
                                            <p className="font-body-md text-body-md text-on-surface mt-2 leading-relaxed whitespace-pre-wrap">{selectedDoc.summary}</p>
                                        ) : (
                                            <div className="mt-3 p-space-md rounded-xl bg-surface-container border border-dashed border-outline-variant/40 flex flex-col items-center text-center gap-3">
                                                <span className="material-symbols-outlined text-[32px] text-outline">summarize</span>
                                                <p className="font-body-md text-body-md text-on-surface-variant">No summary yet. Generate an AI summary of this document.</p>
                                                <button
                                                    id="generate-summary-btn"
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-body-sm text-body-sm font-semibold hover:bg-inverse-primary transition-all shadow-md disabled:opacity-60"
                                                    onClick={() => void generateSummary(false)}
                                                    disabled={summarizing}
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">{summarizing ? 'progress_activity' : 'auto_awesome'}</span>
                                                    <span>{summarizing ? 'Generating…' : 'Generate Summary'}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        {selectedDoc && (
                            <div className="p-space-md bg-surface-container-lowest/60 flex items-center justify-between gap-space-sm border-t border-outline-variant/30 flex-wrap">
                                {selectedDoc.summary ? (
                                    <button
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-highest transition-all font-body-sm text-body-sm disabled:opacity-60"
                                        onClick={() => void generateSummary(true)}
                                        disabled={summarizing}
                                        title="Regenerate with force refresh"
                                    >
                                        <span className={`material-symbols-outlined text-[18px] ${summarizing ? 'animate-spin' : ''}`}>cached</span>
                                        <span>{summarizing ? 'Regenerating…' : 'Regenerate summary'}</span>
                                    </button>
                                ) : (
                                    <span />
                                )}
                                <div className="flex items-center gap-space-sm">
                                    <button
                                        className="px-3 py-2 rounded-lg bg-error-container/20 text-error hover:bg-error-container hover:text-on-error font-body-sm text-body-sm transition-all"
                                        id="trigger-delete-from-modal"
                                        onClick={() => setDeleteTarget(selectedDoc)}
                                    >
                                        Delete document
                                    </button>
                                    <button
                                        className="px-4 py-2 rounded-lg bg-primary-container text-on-primary-container font-headline-sm text-headline-sm font-semibold hover:bg-inverse-primary transition-all shadow-md"
                                        onClick={() => {
                                            setSelectedId(null)
                                            setSelectedDoc(null)
                                            setChatInput(`Tell me about "${selectedDoc.filename || selectedDoc.title}"`)
                                        }}
                                    >
                                        Open in Chat
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ============ DELETE CONFIRMATION MODAL ============ */}
            {deleteTarget && (
                <div
                    className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-md flex items-center justify-center p-gutter"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Delete document"
                    onClick={() => !deleting && setDeleteTarget(null)}
                >
                    <div
                        className="w-full max-w-md bg-surface-container-high rounded-2xl shadow-2xl overflow-hidden p-space-lg flex flex-col items-center text-center border border-outline-variant/30"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-14 h-14 rounded-full bg-error-container/30 flex items-center justify-center mb-space-md">
                            <span className="material-symbols-outlined text-error text-[32px]">warning</span>
                        </div>
                        <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">Delete document?</h3>
                        <p className="font-body-md text-body-md text-on-surface-variant mt-2 leading-relaxed break-all">
                            <strong className="text-on-surface">{deleteTarget.filename || deleteTarget.title}</strong> will be permanently removed from your workspace, vector embeddings index, and cached AI session memory. This action cannot be reversed.
                        </p>
                        <div className="mt-space-lg w-full flex items-center justify-end gap-space-sm">
                            <button
                                className="flex-1 py-2.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-highest font-headline-sm text-headline-sm transition-all disabled:opacity-60"
                                id="cancel-delete-btn"
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                className="flex-1 py-2.5 rounded-lg bg-error text-on-error font-headline-sm text-headline-sm font-semibold hover:bg-error-container transition-all shadow-md disabled:opacity-60"
                                id="confirm-delete-action"
                                onClick={() => void confirmDelete()}
                                disabled={deleting}
                            >
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ TOASTS ============ */}
            <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-space-sm max-w-sm w-[min(24rem,calc(100vw-3rem))]">
                {toasts.map((toast) => (
                    <div key={toast.id} className="p-space-md rounded-xl bg-surface-container-highest shadow-2xl flex items-start gap-space-sm transition-all" role="status">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${toast.kind === 'success' ? 'bg-tertiary-container/30 text-tertiary' : 'bg-error-container/30 text-error'}`}>
                            <span className="material-symbols-outlined text-[16px]">{toast.kind === 'success' ? 'check' : 'error'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="font-body-sm text-body-sm font-semibold text-on-surface block">{toast.title}</span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant block">{toast.message}</span>
                        </div>
                        <button className="text-outline hover:text-on-surface transition-colors" onClick={() => setToasts((t) => t.filter((x) => x.id !== toast.id))} aria-label="Dismiss">
                            <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default Dashboard
