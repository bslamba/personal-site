'use client'

// ============================================================
// components/vault-explorer.tsx
//
// The file explorer. Folders, breadcrumbs, drag-and-drop upload
// with per-file progress, download, delete, and a storage meter.
//
// Uploads go straight from the browser to R2 using a presigned
// URL, so file size is not limited by the serverless body cap.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Folder, FileText, FileSpreadsheet, FileImage, FileArchive, File as FileIcon,
  Upload, FolderPlus, Trash2, Download, Eye, ChevronRight, Home,
  RefreshCw, Search, LogOut, X, Loader2, HardDrive,
} from 'lucide-react'

const HEADING = { fontFamily: 'var(--font-heading)' } as const
const FREE_BYTES = 10 * 1024 * 1024 * 1024   // R2 free tier: 10 GB

interface Entry {
  key: string; name: string; isFolder: boolean; size: number; modified: string | null
}
interface Job { id: string; name: string; pct: number; error?: string }

function human(bytes: number): string {
  if (bytes === 0) return '0 B'
  const u = ['B','KB','MB','GB','TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function iconFor(name: string) {
  const e = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png','jpg','jpeg','gif','webp','svg','heic','bmp'].includes(e)) return FileImage
  if (['xlsx','xls','csv','tsv','numbers'].includes(e)) return FileSpreadsheet
  if (['zip','tar','gz','rar','7z'].includes(e)) return FileArchive
  if (['pdf','doc','docx','txt','md','rtf','pages'].includes(e)) return FileText
  return FileIcon
}

const VIEWABLE = ['png','jpg','jpeg','gif','webp','svg','pdf','txt','md']

export default function VaultExplorer() {
  const [prefix, setPrefix]   = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [usage, setUsage]     = useState({ bytes: 0, objects: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [query, setQuery]     = useState('')
  const [jobs, setJobs]       = useState<Job[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // ---------------- load ----------------
  const load = useCallback(async (p: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/vault/list?prefix=${encodeURIComponent(p)}`)
      if (res.status === 401) { window.location.href = '/vault/login'; return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load files')
      setEntries(data.entries); setUsage(data.usage)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(prefix) }, [prefix, load])

  // ---------------- upload ----------------
  const uploadOne = useCallback(async (file: File) => {
    const id = Math.random().toString(36).slice(2)
    setJobs(j => [...j, { id, name: file.name, pct: 0 }])

    try {
      const key = prefix + file.name
      const signRes = await fetch('/api/vault/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, contentType: file.type }),
      })
      const signed = await signRes.json()
      if (!signRes.ok) throw new Error(signed.error ?? 'Could not prepare upload')

      // XHR rather than fetch, because fetch has no upload progress event
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', signed.url, true)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.upload.onprogress = ev => {
          if (!ev.lengthComputable) return
          const pct = Math.round((ev.loaded / ev.total) * 100)
          setJobs(j => j.map(x => x.id === id ? { ...x, pct } : x))
        }
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300)
          ? resolve() : reject(new Error(`Upload failed (${xhr.status})`))
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(file)
      })

      setJobs(j => j.filter(x => x.id !== id))
    } catch (e: any) {
      setJobs(j => j.map(x => x.id === id ? { ...x, error: e.message } : x))
    }
  }, [prefix])

  const uploadMany = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files)
    for (const f of list) await uploadOne(f)
    load(prefix)
  }, [uploadOne, load, prefix])

  // ---------------- actions ----------------
  async function newFolder() {
    const name = window.prompt('Folder name')
    if (!name) return
    const clean = name.trim().replace(/[/\\]/g, '-')
    if (!clean) return
    const res = await fetch('/api/vault/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefix + clean }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error) ; return }
    load(prefix)
  }

  async function remove(entry: Entry) {
    const what = entry.isFolder
      ? `Delete the folder "${entry.name}" and everything inside it?`
      : `Delete "${entry.name}"?`
    if (!window.confirm(`${what}\n\nThis cannot be undone.`)) return

    const res = await fetch('/api/vault/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: entry.key, isFolder: entry.isFolder }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error); return }
    load(prefix)
  }

  async function open(entry: Entry, inline = false) {
    const res = await fetch(
      `/api/vault/download-url?key=${encodeURIComponent(entry.key)}${inline ? '&inline=1' : ''}`
    )
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    window.open(data.url, '_blank', 'noopener')
  }

  // ---------------- breadcrumbs ----------------
  const parts = prefix.split('/').filter(Boolean)
  const crumbs = parts.map((p, i) => ({ name: p, prefix: parts.slice(0, i + 1).join('/') + '/' }))

  const visible = query
    ? entries.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))
    : entries

  const pctUsed = Math.min(100, (usage.bytes / FREE_BYTES) * 100)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={e => { e.preventDefault(); setDragging(false) }}
      onDrop={e => {
        e.preventDefault(); setDragging(false)
        if (e.dataTransfer.files?.length) uploadMany(e.dataTransfer.files)
      }}
      className={`relative ${dragging ? 'ring-2 ring-signal-500' : ''}`}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-signal-50/90">
          <p className="label text-signal-600">Drop files to upload</p>
        </div>
      )}

      {/* ---------------- TOOLBAR ---------------- */}
      <div className="flex flex-wrap items-center gap-2 border border-ink-200 bg-paper p-3">
        <button onClick={() => fileInput.current?.click()} className="btn-signal !px-4 !py-2.5">
          <Upload className="h-4 w-4" /> Upload
        </button>
        <input
          ref={fileInput} type="file" multiple hidden
          onChange={e => { if (e.target.files) uploadMany(e.target.files); e.target.value = '' }}
        />

        <button onClick={newFolder} className="btn-ghost !px-4 !py-2.5">
          <FolderPlus className="h-4 w-4" /> New folder
        </button>

        <button
          onClick={() => load(prefix)}
          className="flex h-10 w-10 items-center justify-center border border-ink-200 text-ink-500 transition-colors hover:border-signal-400 hover:text-signal-500"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <div className="relative ml-auto min-w-[200px] flex-1 sm:flex-none sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Filter this folder"
            style={HEADING}
            className="w-full border border-ink-200 bg-paper py-2.5 pl-9 pr-3 text-sm outline-none focus:border-signal-500"
          />
        </div>

        <form action="/api/vault/logout" method="post">
          <button
            className="flex h-10 items-center gap-2 border border-ink-200 px-3 text-xs uppercase tracking-widest text-ink-500 transition-colors hover:border-signal-400 hover:text-signal-500"
            style={HEADING}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </div>

      {/* ---------------- BREADCRUMBS + USAGE ---------------- */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap items-center gap-1 text-sm" style={HEADING} aria-label="Breadcrumb">
          <button
            onClick={() => setPrefix('')}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-ink-600 transition-colors hover:text-signal-500"
          >
            <Home className="h-3.5 w-3.5" /> Vault
          </button>
          {crumbs.map(c => (
            <span key={c.prefix} className="inline-flex items-center">
              <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
              <button
                onClick={() => setPrefix(c.prefix)}
                className="px-1.5 py-1 text-ink-600 transition-colors hover:text-signal-500"
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <HardDrive className="h-4 w-4 text-ink-400" />
          <div className="w-32">
            <div className="h-1.5 w-full bg-ink-200">
              <div
                className="h-full bg-signal-500"
                style={{ width: `${pctUsed}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-ink-500" style={HEADING}>
            {human(usage.bytes)} of 10 GB · {usage.objects} files
          </span>
        </div>
      </div>

      {error && (
        <p className="mt-3 flex items-center justify-between border-l-2 border-signal-500 bg-signal-50 px-4 py-2.5 text-sm text-signal-700">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </p>
      )}

      {/* ---------------- UPLOAD PROGRESS ---------------- */}
      {jobs.length > 0 && (
        <div className="mt-3 space-y-2 border border-ink-200 bg-paper-dim p-3">
          {jobs.map(j => (
            <div key={j.id}>
              <div className="flex items-center justify-between text-xs" style={HEADING}>
                <span className="truncate text-ink-700">{j.name}</span>
                <span className={j.error ? 'text-signal-600' : 'text-ink-500'}>
                  {j.error ? j.error : `${j.pct}%`}
                </span>
              </div>
              {!j.error && (
                <div className="mt-1 h-1 w-full bg-ink-200">
                  <div className="h-full bg-signal-500 transition-all" style={{ width: `${j.pct}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---------------- FILE LIST ---------------- */}
      <div className="mt-4 border border-ink-200 bg-paper">
        <div
          className="grid grid-cols-[1fr_auto] gap-4 border-b border-ink-200 px-4 py-2.5 text-[0.6875rem] uppercase tracking-[0.14em] text-ink-400 sm:grid-cols-[1fr_120px_140px_auto]"
          style={HEADING}
        >
          <span>Name</span>
          <span className="hidden sm:block">Size</span>
          <span className="hidden sm:block">Modified</span>
          <span className="text-right">Actions</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-signal-500" />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-20 text-center">
            <Folder className="mx-auto h-8 w-8 text-ink-300" />
            <p className="mt-3 text-sm text-ink-500">
              {query ? 'Nothing matches that filter.' : 'This folder is empty.'}
            </p>
            {!query && (
              <p className="mt-1 text-xs text-ink-400">
                Drag files here, or use the Upload button.
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-ink-200">
            {visible.map(entry => {
              const Icon = entry.isFolder ? Folder : iconFor(entry.name)
              const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
              const canView = !entry.isFolder && VIEWABLE.includes(ext)
              return (
                <li
                  key={entry.key}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-signal-50/50 sm:grid-cols-[1fr_120px_140px_auto]"
                >
                  <button
                    onClick={() => entry.isFolder ? setPrefix(entry.key) : open(entry, canView)}
                    className="flex min-w-0 items-center gap-3 text-left"
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${entry.isFolder ? 'text-signal-500' : 'text-ink-400'}`} />
                    <span className="truncate text-sm text-ink-900" style={HEADING}>
                      {entry.name}
                    </span>
                  </button>

                  <span className="hidden text-xs text-ink-500 sm:block" style={HEADING}>
                    {entry.isFolder ? '—' : human(entry.size)}
                  </span>
                  <span className="hidden text-xs text-ink-500 sm:block" style={HEADING}>
                    {when(entry.modified)}
                  </span>

                  <div className="flex items-center justify-end gap-1">
                    {canView && (
                      <button
                        onClick={() => open(entry, true)}
                        aria-label={`Preview ${entry.name}`}
                        className="flex h-8 w-8 items-center justify-center text-ink-400 transition-colors hover:text-signal-500"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    {!entry.isFolder && (
                      <button
                        onClick={() => open(entry, false)}
                        aria-label={`Download ${entry.name}`}
                        className="flex h-8 w-8 items-center justify-center text-ink-400 transition-colors hover:text-signal-500"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => remove(entry)}
                      aria-label={`Delete ${entry.name}`}
                      className="flex h-8 w-8 items-center justify-center text-ink-400 transition-colors hover:text-signal-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 text-xs text-ink-400">
        Files upload directly to Cloudflare R2 and are stored permanently until you delete them.
        Download links are signed and expire after one hour.
      </p>
    </div>
  )
}
