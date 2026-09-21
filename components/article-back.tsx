'use client'

// ============================================================
// components/article-back.tsx
//
// A persistent "Back" pill, fixed bottom-left, always on screen
// while reading an article. It returns to wherever the article
// belongs — the study guide for track articles, otherwise /blog.
// The destination is spelled out in the tooltip / aria-label.
// ============================================================

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function ArticleBack({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="article-back"
      aria-label={`Back to ${label}`}
      title={`Back to ${label}`}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Back</span>
    </Link>
  )
}
