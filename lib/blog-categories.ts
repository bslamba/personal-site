// ============================================================
// lib/blog-categories.ts
//
// Routes each article into one of three Journal sections based
// on its tags.
//
// TO MOVE AN ARTICLE: add or remove a tag in the lists below,
// or add a tag to the article's frontmatter. Nothing else needs
// touching — the page rebuilds the sections automatically.
// ============================================================

import type { PostSummary } from '@/lib/blog'

export type CategoryId = 'nac' | 'networking' | 'cloud'

export interface Category {
  id: CategoryId
  title: string
  subtitle: string
  blurb: string
  accent: 'signal' | 'ink' | 'outline'
}

export const CATEGORIES: Category[] = [
  {
    id: 'nac',
    title: 'Network Access Control',
    subtitle: 'NAC · 802.1X · AAA',
    blurb:
      'Cisco ISE, RADIUS, EAP, identity and everything that decides who gets on the network.',
    accent: 'signal',
  },
  {
    id: 'networking',
    title: 'Networking',
    subtitle: 'Protocols · Routing · Security',
    blurb:
      'The protocols underneath it all — TCP, DNS, TLS, routing, and the tools to debug them.',
    accent: 'ink',
  },
  {
    id: 'cloud',
    title: 'Cloud & Cloud Security',
    subtitle: 'Azure · Identity · Workloads',
    blurb:
      'Cloud platforms, cloud identity, and securing workloads beyond the perimeter.',
    accent: 'outline',
  },
]

// ------------------------------------------------------------
// Tag → section mapping
// ------------------------------------------------------------

/** Anything access-control, identity or AAA related. */
const NAC_TAGS = new Set([
  'Cisco ISE', 'NAC', 'Network Access Control', 'RADIUS', 'TACACS+',
  'EAP-TLS', '802.1X', 'MAB', 'AAA', 'IBNS 2.0', 'CoA', 'CWA',
  'Posture', 'BYOD', 'Guest Access', 'Onboarding', 'Profiling',
  'pxGrid', 'TrustSec', 'SGT', 'Passive ID', 'Segmentation',
  'Identity', 'Active Directory', 'MDM', 'AnyConnect', 'Compliance',
  'DNA Center', 'Firepower', 'StealthWatch', 'Replication',
  'Release Notes', 'Integration', 'Architecture', 'Deployment',
])

/** Cloud platforms and cloud security. */
const CLOUD_TAGS = new Set([
  'Azure', 'Microsoft Azure', 'AWS', 'GCP', 'Cloud', 'Cloud Security',
  'Entra ID', 'IAM', 'Kubernetes', 'Containers', 'Serverless',
  'Landing Zone', 'Sentinel', 'Defender', 'Zero Trust', 'SASE',
  'Azure AD', 'Conditional Access', 'Key Vault', 'Virtual Network',
  'Storage', 'Governance', 'Cost Management', 'Terraform', 'Bicep',
])

/**
 * Cloud wins over NAC when an article is explicitly about a cloud
 * platform, so future Azure identity pieces land in the right place.
 * Everything unmatched falls through to Networking.
 */
export function categorise(post: PostSummary): CategoryId {
  const tags = post.tags

  if (tags.some(t => CLOUD_TAGS.has(t))) return 'cloud'
  if (tags.some(t => NAC_TAGS.has(t)))   return 'nac'
  return 'networking'
}

export function groupPosts(posts: PostSummary[]): Record<CategoryId, PostSummary[]> {
  const grouped: Record<CategoryId, PostSummary[]> = {
    nac: [], networking: [], cloud: [],
  }
  for (const post of posts) grouped[categorise(post)].push(post)
  return grouped
}
