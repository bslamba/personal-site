import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/blog'
import { REFERENCES } from '@/lib/references'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts()

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: posts[0] ? new Date(posts[0].date) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // Reference pages are routes rather than markdown, so they would
    // otherwise never reach the sitemap. They are the most linkable things
    // on the site, so they carry a higher priority than an article.
    ...REFERENCES.map(reference => ({
      url: `${SITE_URL}${reference.href}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...posts.map(post => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.updated ?? post.date),
      changeFrequency: 'yearly' as const,
      priority: 0.8,
    })),
  ]
}
