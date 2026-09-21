// ============================================================
// app/blog/layout.tsx
//
// Wraps every /blog route. Adds the floating "back to top"
// control site-wide across the blog without touching each page.
// ============================================================

import ScrollTop from '@/components/scroll-top'

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ScrollTop />
    </>
  )
}
