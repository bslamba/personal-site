// ============================================================
// components/ise/types.ts
//
// The shape of a cheat sheet topic. Every topic is a single
// self-contained sheet designed to be read without scrolling.
// ============================================================

import type React from 'react'

export type FamilyId =
  | 'platform'
  | 'policy'
  | 'access'
  | 'visibility'
  | 'operate'

export interface Family {
  id: FamilyId
  title: string
  blurb: string
}

export const FAMILIES: Family[] = [
  {
    id: 'platform',
    title: 'Platform',
    blurb: 'Nodes, sizing, licensing, ports, releases and upgrades.',
  },
  {
    id: 'policy',
    title: 'Policy & Identity',
    blurb: 'Policy sets, identity stores, EAP, certificates, device admin.',
  },
  {
    id: 'access',
    title: 'Access Methods',
    blurb: 'Wired and wireless authentication, guest and BYOD onboarding.',
  },
  {
    id: 'visibility',
    title: 'Visibility & Control',
    blurb: 'Profiling, posture, identity mapping, segmentation, integrations.',
  },
  {
    id: 'operate',
    title: 'Operate',
    blurb: 'Logs, failure codes, troubleshooting and automation.',
  },
]

export interface Topic {
  /** URL hash and stable key. */
  id: string
  /** Full title shown on the sheet header. */
  title: string
  /** Short title for the hub card. */
  short: string
  family: FamilyId
  /** One line describing what the sheet covers. */
  blurb: string
  /** Words that should find this topic in the hub search. */
  tags: string[]
  /** Set when the sheet carries a configuration selector. */
  interactive?: string
  Sheet: React.ComponentType
}
