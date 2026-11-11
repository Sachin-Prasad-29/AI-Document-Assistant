import axios from 'axios'
import { supabase } from './supabase'

const API = import.meta.env.VITE_API_URL as string | undefined

export const apiClient = axios.create({
  baseURL: API,
})

// Attach the Supabase Bearer token to every request
apiClient.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ---------- Types ----------

export interface UserProfile {
  id: string
  email: string
  role: string
}

export interface Document {
  id: string
  title: string
  filename: string | null
  num_chunks: number
  status: string
  error: string | null
  summary: string | null
  uploaded_by: string
  created_at: string
}

export interface CreateDocumentInput {
  title: string
  content: string
}

export interface SummarizeResponse {
  document_id: string
  summary: string
}

export interface ApprovalRequest {
  action: string
  document_id?: string
  title?: string
  message: string
}

export interface ChatResponse {
  thread_id: string
  status: 'completed' | 'awaiting_approval' | string
  answer: string | null
  tools_used: string[]
  approval_request: ApprovalRequest | null
}

// ---------- API 1: current user profile ----------
export async function getMe(): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>('/documents/me')
  return data
}

// ---------- API 2: list my documents ----------
export async function getDocuments(): Promise<Document[]> {
  const { data } = await apiClient.get<Document[]>('/documents')
  return data
}

// ---------- API 3: create a document from text ----------
export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const { data } = await apiClient.post<Document>('/documents', input)
  return data
}

// ---------- API 4: upload a document file ----------
export async function uploadDocument(file: File): Promise<Document> {
  const formData = new FormData()
  formData.append('file', file)
  // axios sets the multipart boundary automatically when given FormData
  const { data } = await apiClient.post<Document>('/documents/upload', formData)
  return data
}

// ---------- API 5: get a single document ----------
export async function getDocument(documentId: string): Promise<Document> {
  const { data } = await apiClient.get<Document>(`/documents/${documentId}`)
  return data
}

// ---------- API 6: delete a document ----------
export async function deleteDocument(documentId: string): Promise<void> {
  await apiClient.delete(`/documents/${documentId}`)
}

// ---------- API 7: summarize a document ----------
export async function summarizeDocument(
  documentId: string,
  force = false,
): Promise<SummarizeResponse> {
  const { data } = await apiClient.post<SummarizeResponse>(
    `/documents/${documentId}/summarize`,
    { force },
  )
  return data
}

// ---------- API 8: chat with the assistant ----------
// threadId is optional: the first message of a conversation is sent
// without a thread_id, and the backend returns one to reuse afterwards.
export async function sendChatMessage(
  message: string,
  threadId?: string | null,
): Promise<ChatResponse> {
  const { data } = await apiClient.post<ChatResponse>('/chat', {
    message,
    ...(threadId ? { thread_id: threadId } : {}),
  })
  return data
}

// ---------- API 9: resume a chat after an approval request ----------
export async function resumeChat(
  threadId: string,
  approved: boolean,
): Promise<ChatResponse> {
  const { data } = await apiClient.post<ChatResponse>('/chat/resume', {
    thread_id: threadId,
    approved,
  })
  return data
}
