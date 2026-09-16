'use client'

// ============================================================
// components/vault/photo-wall.tsx
//
// Family photos. Albums are folders under "family/" in the same
// S3 bucket as the vault. Upload straight from your phone (presigned
// PUT — bytes never touch the server), sort into albums, and play an
// album back as a soft crossfade + Ken-Burns slideshow.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Upload, Trash2, Loader2, X, ChevronLeft, ChevronRight,
  Play, FolderPlus, ImageOff,
} from 'lucide-react'

interface Cat { name: string; count: number; cover: string | null }
interface Photo { key: string; name: string; size: number; modified: string | null; url: string }

function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed')))
    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.send(file)
  })
}

export default function PhotoWall() {
  const [cats, setCats] = useState<Cat[]>([])
  const [cat, setCat] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [newCat, setNewCat] = useState('')
  const [busy, setBusy] = useState(false)
  const [up, setUp] = useState<{ name: string; pct: number } | null>(null)
  const [light, setLight] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadCats = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/vault/photos')
      const d = await r.json()
      setCats(d.categories ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const loadPhotos = useCallback(async (name: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/vault/photos?category=${encodeURIComponent(name)}`)
      const d = await r.json()
      setPhotos(d.photos ?? [])
    } catch { setPhotos([]) }
    setLoading(false)
  }, [])

  useEffect(() => { loadCats() }, [loadCats])

  const openCat = (name: string) => { setCat(name); setLight(null); loadPhotos(name) }
  const backToCats = () => { setCat(null); setPhotos([]); loadCats() }

  async function createCat() {
    const name = newCat.trim()
    if (!name) return
    setBusy(true)
    try {
      await fetch('/api/vault/photos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: name }),
      })
      setNewCat('')
      await loadCats()
      openCat(name)
    } catch { /* ignore */ }
    setBusy(false)
  }

  async function onFiles(files: FileList | null) {
    if (!files || !cat) return
    const list = Array.from(files)
    for (const file of list) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_')
      const key = `family/${cat}/${Date.now()}-${safe}`
      setUp({ name: file.name, pct: 0 })
      try {
        const r = await fetch('/api/vault/upload-url', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, contentType: file.type }),
        })
        const { url } = await r.json()
        if (!url) throw new Error('no url')
        await putWithProgress(url, file, pct => setUp({ name: file.name, pct }))
      } catch { /* skip this file */ }
    }
    setUp(null)
    await loadPhotos(cat)
  }

  async function del(key: string) {
    setPhotos(p => p.filter(x => x.key !== key))
    try {
      await fetch('/api/vault/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, isFolder: false }),
      })
    } catch { /* ignore */ }
  }

  return (
    <div className="vg">
      <div className="vg-wrap">
        <div className="vg-top">
          <div>
            <Link href="/vault" className="vg-back"><ArrowLeft className="h-4 w-4" /> Vault</Link>
            <h1 className="vg-h1">{cat ?? 'Family Photos'}</h1>
            {cat && <p className="vg-sub">{photos.length} photo{photos.length === 1 ? '' : 's'} · <button className="vg-btn-ghost vg-btn" style={{ padding: 0 }} onClick={backToCats}>all albums</button></p>}
          </div>
          {cat && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {photos.length > 1 && <button className="vg-btn" onClick={() => setLight(0)}><Play className="h-4 w-4" /> Slideshow</button>}
              <button className="vg-btn vg-btn-primary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload</button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => onFiles(e.target.files)} />
            </div>
          )}
        </div>

        {up && (
          <div className="vg-card vg-pad" style={{ marginBottom: '1rem' }}>
            <div className="vg-up">
              <Loader2 className="h-4 w-4 vg-spin" /> Uploading {up.name}
              <span className="vg-bar"><i style={{ width: `${up.pct}%` }} /></span>
              <b>{up.pct}%</b>
            </div>
          </div>
        )}

        {loading ? (
          <p className="vg-empty"><Loader2 className="h-5 w-5 vg-spin" style={{ display: 'inline' }} /> Loading…</p>
        ) : cat ? (
          photos.length ? (
            <div className="vg-photo-grid">
              {photos.map((p, i) => (
                <div key={p.key} className="vg-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.name} loading="lazy" onClick={() => setLight(i)} />
                  <button className="vg-icobtn" style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(255,255,255,0.85)' }}
                    onClick={() => del(p.key)} aria-label="Delete photo"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="vg-card vg-pad vg-empty">
              <ImageOff className="h-8 w-8" style={{ display: 'inline', color: 'var(--vg-accent)' }} />
              <p>No photos in <b>{cat}</b> yet.</p>
              <button className="vg-btn vg-btn-primary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Upload the first ones</button>
            </div>
          )
        ) : (
          <>
            <div className="vg-card vg-pad" style={{ marginBottom: '1.1rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <FolderPlus className="h-5 w-5" style={{ color: 'var(--vg-accent)' }} />
              <input className="vg-input" style={{ maxWidth: 260 }} placeholder="New album name (e.g. Yercaud Trip)"
                value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCat()} />
              <button className="vg-btn vg-btn-primary" onClick={createCat} disabled={busy || !newCat.trim()}>
                {busy ? <Loader2 className="h-4 w-4 vg-spin" /> : <Plus className="h-4 w-4" />} Create album
              </button>
            </div>

            {cats.length ? (
              <div className="vg-tiles">
                {cats.map(c => (
                  <div key={c.name} className="vg-cat" onClick={() => openCat(c.name)}>
                    {c.cover
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.cover} alt={c.name} loading="lazy" />
                      : <div className="ph" />}
                    <div className="cap"><b>{c.name}</b><i>{c.count} photo{c.count === 1 ? '' : 's'}</i></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="vg-empty">No albums yet — create your first one above, then upload photos from your phone.</p>
            )}
          </>
        )}
      </div>

      {light !== null && photos.length > 0 && (
        <Lightbox photos={photos} index={light} onClose={() => setLight(null)} onIndex={setLight} />
      )}
    </div>
  )
}

function Lightbox({ photos, index, onClose, onIndex }: {
  photos: Photo[]; index: number; onClose: () => void; onIndex: (i: number) => void
}) {
  const go = useCallback((d: number) => onIndex((index + d + photos.length) % photos.length), [index, photos.length, onIndex])

  useEffect(() => {
    const t = setInterval(() => go(1), 4500)
    return () => clearInterval(t)
  }, [go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  return (
    <div className="vg-lb" onClick={onClose}>
      <button className="vg-lb-x" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
      <div className="vg-lb-stage" onClick={e => e.stopPropagation()}>
        {photos.map((p, i) => (
          <div key={p.key} className="vg-slide" data-on={i === index}>
            {i === index /* only render the active image's heavy element */ && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.url} alt={p.name} />
            )}
          </div>
        ))}
        <button className="vg-lb-btn" style={{ left: 8 }} onClick={() => go(-1)} aria-label="Previous"><ChevronLeft className="h-6 w-6" /></button>
        <button className="vg-lb-btn" style={{ right: 8 }} onClick={() => go(1)} aria-label="Next"><ChevronRight className="h-6 w-6" /></button>
      </div>
    </div>
  )
}
