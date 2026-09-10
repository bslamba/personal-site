import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /happy-birthday is a private surprise on a public URL:
      // openable by anyone holding the link, and findable by no one.
      // The page also sends noindex, so this is belt and braces.
      disallow: ['/vault', '/vault/', '/api/', '/happy-birthday'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
