// ============================================================
// lib/blog.ts
//
// Reads markdown articles from content/blog/ at BUILD TIME and
// turns them into data the site can use.
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')

export interface Post {
  slug: string
  title: string
  excerpt: string
  date: string
  updated?: string
  tags: string[]
  cover?: string
  coverAlt?: string
  draft: boolean
  html: string
  plain: string
  readingMinutes: number
  headings: { id: string; text: string; level: number }[]
}

export interface PostSummary {
  slug: string
  title: string
  excerpt: string
  date: string
  tags: string[]
  cover?: string
  readingMinutes: number
  searchText: string
}

const marked = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext'
      return hljs.highlight(code, { language }).value
    },
  }),
  { gfm: true, breaks: false }
)

// YAML turns an unquoted 2026-08-14 into a Date object, but a
// quoted "2026-08-14" stays a string. Handle both.
function toISODate(value: unknown): string | undefined {
  if (!value) return undefined

  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const s = String(value).trim()
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? match[0] : undefined
}

// Marked escapes quotes and ampersands in heading text. The table
// of contents shows that text as-is, so decode it back.
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')   // last, so we don't double-decode
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function parseFile(filename: string): Post {
  const slug = filename.replace(/\.md$/, '')
  const raw = fs.readFileSync(path.join(BLOG_DIR, filename), 'utf8')
  const { data, content } = matter(raw)

  const headings: Post['headings'] = []
  const renderer = new marked.Renderer()
  renderer.heading = function ({ tokens, depth }: any) {
    const html = this.parser.parseInline(tokens)
    const plain = decodeEntities(html.replace(/<[^>]+>/g, ''))
    const id = slugifyHeading(plain)
    if (depth === 2 || depth === 3) headings.push({ id, text: plain, level: depth })
    return `<h${depth} id="${id}">${html}</h${depth}>\n`
  }

  const html = marked.parse(content, { renderer }) as string
  const plain = content.replace(/[#*`_>\[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim()
  const words = plain.split(/\s+/).filter(Boolean).length

  return {
    slug,
    title: data.title ?? slug,
    excerpt: data.excerpt ?? '',
    date: toISODate(data.date) ?? '1970-01-01',
    updated: toISODate(data.updated),
    tags: Array.isArray(data.tags) ? data.tags : [],
    cover: data.cover,
    coverAlt: data.coverAlt,
    draft: data.draft === true,
    html,
    plain,
    readingMinutes: Math.max(1, Math.round(words / 200)),
    headings,
  }
}

/** Every published article, newest first. Drafts excluded. */
export function getAllPosts(): Post[] {
  if (!fs.existsSync(BLOG_DIR)) return []

  return fs
    .readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.md'))
    .map(parseFile)
    .filter(p => !p.draft)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** One article by slug, or null. */
export function getPost(slug: string): Post | null {
  const file = path.join(BLOG_DIR, `${slug}.md`)
  if (!fs.existsSync(file)) return null
  const post = parseFile(`${slug}.md`)
  return post.draft ? null : post
}

/** Lightweight version for the index, with a search field. */
export function getPostSummaries(): PostSummary[] {
  return getAllPosts().map(p => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    date: p.date,
    tags: p.tags,
    cover: p.cover,
    readingMinutes: p.readingMinutes,
    searchText: [p.title, p.excerpt, p.tags.join(' '), p.plain].join(' ').toLowerCase(),
  }))
}

/** Every tag in use, with counts. */
export function getAllTags(): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const post of getAllPosts()) {
    for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** Articles sharing tags with this one. Used for internal linking. */
export function getRelatedPosts(slug: string, limit = 4): PostSummary[] {
  const current = getPost(slug)
  if (!current) return []

  return getPostSummaries()
    .filter(p => p.slug !== slug)
    .map(p => ({
      post: p,
      shared: p.tags.filter(t => current.tags.includes(t)).length,
    }))
    .filter(x => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.post.date.localeCompare(a.post.date))
    .slice(0, limit)
    .map(x => x.post)
}

export function getPostSlugs(): string[] {
  return getAllPosts().map(p => p.slug)
}
