'use client'

// ============================================================
// Topic — ISE 3.x Releases
//
// The release explorer is the interactive part: pick a version
// and you get its headline features grouped, what it removed,
// and the one-line reason to be on it.
// ============================================================

import React, { useDeferredValue, useState } from 'react'
import {
  Sheet,
  Panel,
  Table,
  KV,
  Bullets,
  Note,
  Prose,
  Stack,
  Pill,
  M,
  Split,
  Selector,
} from '../sheet-kit'

interface Release {
  id: string
  label: string
  name: string
  ga: React.ReactNode
  patch: React.ReactNode
  support: React.ReactNode
  supportTone: 'good' | 'warn' | 'bad' | 'neutral'
  why: React.ReactNode
  groups: { title: string; items: React.ReactNode[] }[]
  gone: React.ReactNode[]
  platform: React.ReactNode[]
}

const RELEASES: Release[] = [
  {
    id: '30',
    label: '3.0',
    name: 'ISE 3.0 — the start of the 3.x train',
    ga: <>A 2020 release — the 3.0 Upgrade Guide is stamped 4 Aug 2020</>,
    patch: <>Not tracked here</>,
    support: <>Last date of support 13 Jul 2025</>,
    supportTone: 'bad',
    why: (
      <>
        You would not. 3.0 has been out of support since July 2025 and Cisco no
        longer publishes its release notes.
      </>
    ),
    groups: [
      {
        title: 'What is still documented',
        items: [
          <>
            <strong>Smart Licensing only.</strong> Cisco ISE 3.0 and later
            supports <em>only</em> Smart Licensing — the traditional licence
            files are gone
          </>,
          <>ACS&nbsp;→&nbsp;ISE migration guide published for this release</>,
          <>A DevNet API documentation set of its own</>,
        ],
      },
      {
        title: 'Treat as folklore',
        items: [
          <>
            The refreshed admin UI and the move to{' '}
            <strong>Essentials / Advantage / Premier</strong> are routinely
            credited to 3.0, but no current Cisco primary source dates the tier
            model to this release
          </>,
          <>
            Cisco&rsquo;s own licensing videos are titled &ldquo;2.x to
            v3.1&rdquo; and &ldquo;v3.0 to v3.1&rdquo;, implying the change
            landed in two steps rather than one
          </>,
        ],
      },
      {
        title: 'If you are still on it',
        items: [
          <>No security fixes, no TAC. This is a migration, not an upgrade</>,
          <>
            Hardware is usually the deciding factor — if the appliance predates
            the target release, use Backup / Reimage / Restore
          </>,
        ],
      },
    ],
    gone: [<>Non-Smart licensing</>],
    platform: [<>Superseded — see the Deployment &amp; Sizing sheet</>],
  },

  {
    id: '31',
    label: '3.1',
    name: 'ISE 3.1 — cloud, SAML SSO and split upgrade',
    ga: <>3 August 2021</>,
    patch: <>Final full maintenance patch: P10</>,
    support: <>Maintenance ends 3 Nov 2026 · LDoS 30 Nov 2027</>,
    supportTone: 'warn',
    why: (
      <>
        Historically: the first release you could run in AWS, and the one that
        made pxGrid 2.0 mandatory. Today it is a source, not a target.
      </>
    ),
    groups: [
      {
        title: 'Cloud and platform',
        items: [
          <>
            <strong>ISE on AWS</strong> — CloudFormation templates or an AMI
          </>,
          <>VMware cloud environments supported; ERS auto-enabled</>,
          <>
            Virtual appliance licences consolidated into one{' '}
            <strong>ISE VM Common</strong> licence
          </>,
        ],
      },
      {
        title: 'Admin, API and upgrade',
        items: [
          <>
            <strong>SAML admin login with SSO</strong>; ISE now accepts only
            signed SAML requests and assertions
          </>,
          <>
            <strong>Full and split upgrade options in the GUI</strong> — the
            streamlined upgrade experience
          </>,
          <>OpenAPI services for repository, certificate and policy management</>,
          <>pxGrid client auto-approval API · Zero Touch Provisioning</>,
          <>Enhanced audit logs (posture policies, RBAC, user management)</>,
          <>Authorization result alarms driven by policy outcome</>,
        ],
      },
      {
        title: 'Endpoint and identity',
        items: [
          <>
            <strong>Posture on Linux</strong> — Ubuntu, Red Hat, SUSE
          </>,
          <>
            <strong>MAC randomisation handling</strong> for BYOD; random and
            changing MAC addresses
          </>,
          <>Preferred domain controller during AD failover; AD lockout prevention</>,
          <>Android supplicant profiles with EST / SCEP certificate options</>,
          <>Logical profile auto-assignment during profiling</>,
          <>RADIUS CoA proxy · endpoint remediation scripts</>,
        ],
      },
    ],
    gone: [
      <>
        <strong>pxGrid 1.0 (XMPP) discontinued</strong> — pxGrid 2.0
        (WebSocket/REST) is mandatory from 3.1
      </>,
      <>Cisco Secure ACS migration tool no longer supported</>,
    ],
    platform: [<>AWS · VMware cloud</>],
  },

  {
    id: '32',
    label: '3.2',
    name: 'ISE 3.2 — Azure, OCI, Entra ID and pxGrid Direct',
    ga: <>16 August 2022</>,
    patch: <>P10 — 24 Apr 2026 · final full maintenance patch: P8</>,
    support: <>Maintenance ends 3 Nov 2026 · LDoS 30 Nov 2027</>,
    supportTone: 'warn',
    why: (
      <>
        Native deployment on all three clouds, and the first release that
        authenticates EAP-TLS and TEAP against Microsoft Entra ID.
      </>
    ),
    groups: [
      {
        title: 'Cloud and platform',
        items: [
          <>
            Deploy ISE natively on <strong>AWS, Azure and OCI</strong>
          </>,
          <>
            <strong>Extra-small VM</strong> deployment — 8 vCPU, 32 GB RAM
          </>,
          <>SNS 3700 series appliance support</>,
        ],
      },
      {
        title: 'Identity and policy',
        items: [
          <>
            <strong>EAP-TLS and TEAP with Microsoft Entra ID</strong>
          </>,
          <>
            <strong>Certificate SID support</strong> — stops authentication
            failures caused by incorrect parsing
          </>,
          <>Authorization policies for PassiveID login users via AD</>,
          <>Internal user password expiration</>,
          <>Cisco Private 5G support, with RADIUS authorization flows</>,
        ],
      },
      {
        title: 'Context, data and UI',
        items: [
          <>
            <strong>pxGrid Direct</strong> — pull endpoint data from external
            REST APIs returning JSON
          </>,
          <>
            <strong>Data Connect</strong> — ODBC/JDBC access to the database for
            custom reporting (introduced here)
          </>,
          <>
            <strong>System 360</strong> — Grafana monitoring plus Elasticsearch
            log analytics
          </>,
          <>Posture condition scripts (PowerShell, Shell)</>,
          <>Dark mode · MDM queries to multiple servers</>,
          <>ERS PATCH requests and OpenAPI specifications</>,
        ],
      },
    ],
    gone: [
      <>RSA / RADIUS external databases for API authentication (3.2 P7)</>,
      <>Transport Gateway removed (3.2 P6)</>,
      <>
        &ldquo;Cisco AnyConnect&rdquo; rebranded to{' '}
        <strong>Cisco Secure Client</strong>
      </>,
    ],
    platform: [<>AWS · Azure · OCI · SNS 3700 · extra-small VM</>],
  },

  {
    id: '33',
    label: '3.3',
    name: 'ISE 3.3 — split upgrade, TLS 1.3 and machine-learned profiling',
    ga: <>5 July 2023, per the release notes</>,
    patch: <>P11 — 17 Apr 2026</>,
    support: <>An EoL notice is published; milestone dates are not quoted here</>,
    supportTone: 'neutral',
    why: (
      <>
        Split upgrade, native IPsec instead of the old ESR, and the first
        release where profiling gains multi-factor classification.
      </>
    ),
    groups: [
      {
        title: 'Upgrade and operations',
        items: [
          <>
            <strong>Split upgrade</strong> methodology — the deployment is
            updated in phases
          </>,
          <>
            Scheduled, <strong>controlled application restart</strong> after
            admin certificate renewal
          </>,
          <>Navigation improvements and ISE cipher control</>,
          <>RADIUS Step Latency dashboard</>,
        ],
      },
      {
        title: 'Crypto and API',
        items: [
          <>
            <strong>TLS 1.3 for the admin GUI over HTTPS</strong>
          </>,
          <>
            <strong>Native IPsec</strong> configuration, replacing legacy ESR
          </>,
          <>Certificate-based API authentication alongside password methods</>,
          <>Cisco Duo integration for MFA · API support for LDAP</>,
        ],
      },
      {
        title: 'Profiling, posture, pxGrid',
        items: [
          <>
            <strong>AI/ML rule proposals for endpoint profiling</strong> from
            continuous network learning
          </>,
          <>
            <strong>Multi-factor classification (MFC)</strong> — four new
            endpoint attributes: type, manufacturer, model, OS
          </>,
          <>Wi-Fi edge analytics as a profiling source; custom attribute reprofiling trigger</>,
          <>ARM64 agent support for posture and client provisioning</>,
          <>IPv6 across portals, profiler features and agentless posture</>,
          <>
            pxGrid context-in bulk update/delete · pxGrid Direct{' '}
            <strong>Sync Now</strong>
          </>,
        ],
      },
    ],
    gone: [
      <>Legacy IPsec (ESR) no longer supported (3.3 P2)</>,
      <>Transport Gateway support eliminated (3.3 P2)</>,
      <>RSA / RADIUS external database API authentication discontinued (3.3 P3)</>,
      <>Identity Lock Settings removed from RADIUS Settings (3.3 P4)</>,
    ],
    platform: [
      <>SNS 3595 no longer supported — migrate to 3655</>,
      <>SNS 3800 series added in 3.3 Patch 7</>,
    ],
  },

  {
    id: '34',
    label: '3.4',
    name: 'ISE 3.4 — Common Policy, upgrade rollback, faster everything',
    ga: <>4 August 2024</>,
    patch: <>P6 — late April 2026</>,
    support: <>Current — one of the two suggested targets</>,
    supportTone: 'good',
    why: (
      <>
        Common Policy, an upgrade you can roll back, and a restart that no
        longer eats the maintenance window.
      </>
    ),
    groups: [
      {
        title: 'Policy and segmentation',
        items: [
          <>
            <strong>Common Policy</strong> — consistent access and segmentation
            control across devices, users and applications
          </>,
          <>
            <strong>PAC-less RADIUS</strong> communication for TrustSec
            integrations
          </>,
          <>SGACL syntax validation · enhanced FQDN-to-SGT mapping</>,
          <>Dynamic reauthorization scheduler with session expiration</>,
          <>
            Multiple Cisco <strong>ACI connectors</strong>, with a UI dashboard
            and workflow for the ACI–ISE exchange
          </>,
        ],
      },
      {
        title: 'Crypto and identity',
        items: [
          <>
            <strong>Virtual Tunnel Interfaces with native IPsec</strong>, FIPS
            140-3 compliant
          </>,
          <>TACACS+ over TLS; TACACS+ support to prevent AD user lockout</>,
          <>
            <strong>TLS 1.3</strong> for EAP-TLS, TEAP and secure TCP syslog
          </>,
          <>User/device authorization via Entra ID EAP-TLS and TEAP-TLS</>,
          <>Enforcing AD domain controller selection with priority</>,
          <>Enhanced password security preventing plaintext exposure</>,
          <>
            <strong>IPv6 support for RADIUS and CoA</strong>
          </>,
        ],
      },
      {
        title: 'Operations and pxGrid',
        items: [
          <>
            <strong>Automatic log bundle generation during upgrades</strong>
          </>,
          <>
            <strong>Upgrade rollback</strong> for the single upgrade flow
          </>,
          <>
            Dramatically reduced restart times; localised install cuts install
            from ~5–7 hours to ~1–2 hours
          </>,
          <>Certificate Authority diagnostic tool · direct TAC case creation from the GUI</>,
          <>Time-restricted debug enabling with automatic reset</>,
          <>
            pxGrid Direct <strong>URL Pusher</strong> connector, on-demand sync,
            persistent database, array support in authorization policy
          </>,
          <>
            New pxGrid topics: <M>sessionTopicAll</M> and Endpoint
          </>,
        ],
      },
    ],
    gone: [
      <>Legacy IPsec (ESR) eliminated</>,
      <>RSA / RADIUS for API authentication no longer supported</>,
      <>Transport Gateway removed — affects Smart Licensing and telemetry</>,
      <>Location Services GUI removed · NAC Managers GUI removed</>,
    ],
    platform: [<>SNS 3800 series supported from ISE 3.4 Patch 4</>],
  },

  {
    id: '35',
    label: '3.5',
    name: 'ISE 3.5 — single-stack IPv6, FIPS 140-3 and Blast-RADIUS',
    ga: <>22 September 2025</>,
    patch: <>P1 15 Dec 2025 · P2 26 Feb 2026 · P3 13 Apr 2026</>,
    support: <>Current — the suggested release for everything except 3.4</>,
    supportTone: 'good',
    why: (
      <>
        An IPv6-only deployment is finally possible, RADIUS responses carry
        Message-Authenticator, and this is where Cisco is pointing upgrades.
      </>
    ),
    groups: [
      {
        title: 'Networking and IPv6',
        items: [
          <>
            <strong>Single-stack IPv6</strong> — IPv6-only deployments,
            switched via the <M>reset-config</M> CLI
          </>,
          <>IPv6 for SXP, TrustSec policy download and AAA servers over RADIUS</>,
          <>Full IPv6 across ERS, OpenAPI, API Gateway and the MnT REST API</>,
          <>HTTP/2 in the API gateway</>,
          <>Management interface selection during setup (eth0–eth5, SNS 3700/3800)</>,
          <>
            <strong>Cisco Data Grid Service</strong> adds new network
            requirements: <M>TCP 47500</M> <M>47100</M> <M>10800</M>
          </>,
        ],
      },
      {
        title: 'Authentication and hardening',
        items: [
          <>
            <strong>Message-Authenticator in all RADIUS responses</strong>,
            configurable per NAD — the Blast-RADIUS mitigation
          </>,
          <>OAuth2 for MDM vendors: Intune, Jamf Pro, Omnissa · OAuth for SMTP</>,
          <>OpenID Connect for self-registered guest portals</>,
          <>TACACS+ over TLS 1.3 with SAN validation; ROPC workflow for TACACS+</>,
          <>
            <strong>FIPS 140-3 compliance mode</strong>; NDcPP v3.0e Common
            Criteria; DoDIN APL testing
          </>,
          <>Windows Server 2025 Active Directory support (needs KB5068861)</>,
        ],
      },
      {
        title: 'Profiling, posture, TrustSec, ops',
        items: [
          <>
            <strong>SNMP-based device profiling</strong> for IoT, scheduled or
            on demand · Probe Status dashboard
          </>,
          <>Cloud MFC profiler with cloud attribute sharing; MFC-based policies</>,
          <>
            <strong>Continuous reassessment</strong> with Cisco Secure Client;
            posture grace periods; USB disk encryption and osquery conditions
          </>,
          <>Redesigned TrustSec policy GUI, matrix optimisation, security service insertion</>,
          <>pxGrid Cloud in Europe, Asia-Pacific and Japan; Integration Catalog</>,
          <>
            Licence consumption tracking per active endpoint —{' '}
            <strong>visibility only</strong>, no enforcement yet
          </>,
          <>TC-NAC high availability · NTP authentication keys with AES128/256</>,
        ],
      },
    ],
    gone: [
      <>Cognitive Threat Analytics (CTA) adapter no longer supported for TC-NAC</>,
      <>
        Endpoint Replication page deprecated (
        <M>Administration &gt; System &gt; Settings</M>)
      </>,
    ],
    platform: [
      <>SNS 3800 series (3815 / 3855 / 3895) on Cisco UCS C225 M8</>,
      <>Red Hat OpenShift · VMware vMotion (hot and cold) · Azure Stack HCI 23H2+</>,
    ],
  },
]

export default function ReleasesSheet() {
  const [relId, setRelId] = useState(RELEASES[RELEASES.length - 1].id)
  // The detail panel below is large; deriving it from a DEFERRED id lets React
  // paint the button's new state immediately and re-render the heavy content as
  // a low-priority, interruptible pass — which is what keeps INP responsive.
  const shownId = useDeferredValue(relId)
  const rel = RELEASES.find(r => r.id === shownId) ?? RELEASES[0]

  return (
    <Sheet>
      {/* ---------------- the release model ---------------- */}
      <Panel title="How Cisco ships ISE" kicker="Release lifecycle bulletin" span={4}>
        <Stack gap={7}>
          <Prose>
            Cisco plans a new ISE software version roughly every{' '}
            <strong>eight months</strong>, and supports each one for{' '}
            <strong>four years</strong>. A release is not a single date: it
            passes through a fixed set of milestones, and what you lose at each
            one is different.
          </Prose>
          <KV
            items={[
              ['Cadence', 'A new version approximately every 8 months'],
              ['Support life', '4 years from release'],
              [
                'Milestones',
                <>
                  EoL announcement → end of software maintenance → end of
                  vulnerability and security support → last date of support
                </>,
              ],
              [
                'Where dates live',
                'The lifecycle bulletin defines the framework only. Per-release dates come from the EoS/EoL notice listing',
              ],
            ]}
            labelWidth={78}
          />
          <Note label="Read the middle milestone">
            End of software maintenance is the one that matters
            operationally — after it you still have support, but no new patches,
            so a bug that bites you is a bug you live with until you upgrade.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- suggested release ---------------- */}
      <Panel title="Cisco Suggested Release" kicker="As of July 2026" span={3} tone="signal">
        <Stack gap={7}>
          <Prose>
            The suggested release is published separately from the lifecycle
            bulletin — it is Cisco&rsquo;s opinion about what to run, not a
            support boundary. Right now it is a{' '}
            <strong>two-path recommendation</strong>, described by Cisco as
            temporary.
          </Prose>
          <Table
            head={['If you are', 'Target']}
            widths={['58%', '42%']}
            rows={[
              [
                <>On 3.4 and you do not need 3.5 features</>,
                <strong key="a">3.4 Patch 6</strong>,
              ],
              [<>On any other 3.x release</>, <strong key="b">3.5 Patch 3</strong>],
            ]}
          />
          <Note label="The sanctioned path">
            3.4 P6 → 3.5 P3, by GUI split upgrade. Cisco publishes a
            walkthrough for exactly that hop, which is a good sign it is the
            path that gets tested.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- timeline ---------------- */}
      <Panel title="Timeline and end-of-life" kicker="From release notes and EoL notices" span={5}>
        <Table
          head={['Release', 'GA', 'Latest patch seen', 'Support position']}
          widths={['12%', '20%', '26%', '42%']}
          rows={[
            [
              '3.0',
              <span key="a" className="text-ink-400">2020</span>,
              '—',
              <>
                Last date of support <strong>13 Jul 2025</strong> —{' '}
                <Pill tone="bad">out of support</Pill>
              </>,
            ],
            [
              '3.1',
              '3 Aug 2021',
              'Final full maintenance patch P10',
              <>
                EoL announced 5 May 2025 · maintenance ends 3 Nov 2026 ·{' '}
                <strong>LDoS 30 Nov 2027</strong>
              </>,
            ],
            [
              '3.2',
              '16 Aug 2022',
              'P10 — 24 Apr 2026',
              <>
                Same combined notice as 3.1 · final full maintenance patch P8 ·{' '}
                <strong>LDoS 30 Nov 2027</strong>
              </>,
            ],
            [
              '3.3',
              '5 Jul 2023',
              'P11 — 17 Apr 2026',
              <>An EoL notice is published; its milestone dates are not repeated here</>,
            ],
            [
              '3.4',
              '4 Aug 2024',
              'P6 — late Apr 2026',
              <>
                <Pill tone="good">suggested</Pill> for deployments already on
                3.4
              </>,
            ],
            [
              '3.5',
              '22 Sep 2025',
              'P3 — 13 Apr 2026',
              <>
                <Pill tone="good">suggested</Pill> for everything else. Current
                top of the train
              </>,
            ],
          ]}
        />
        <div className="mt-2">
          <Note label="Dates are documentation, not marketing">
            The GA column is the release notes&rsquo; own &ldquo;First
            Published&rdquo; stamp, which is occasionally earlier than customer
            availability. 3.4 is the one independently corroborated by a Cisco
            blog post.
          </Note>
        </div>
      </Panel>

      {/* ---------------- THE RELEASE EXPLORER ---------------- */}
      <Panel
        title="Release explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Pick a version — features, removals, and whether it is worth the outage
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={RELEASES.map(r => ({ id: r.id, label: r.label }))}
              value={relId}
              onChange={setRelId}
              label="Release"
            />
            <Pill tone={rel.supportTone}>{rel.support}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              {/* left: identity and verdict */}
              <div className="col-span-3">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {rel.name}
                </h4>
                <div className="mt-1.5">
                  <KV
                    items={[
                      ['GA', rel.ga],
                      ['Patches', rel.patch],
                    ]}
                    labelWidth={54}
                  />
                </div>
                <div className="mt-2">
                  <Note label="Why upgrade to it">{rel.why}</Note>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Platforms
                  </div>
                  <Bullets items={rel.platform} />
                </div>
              </div>

              {/* middle: the features */}
              <div className="col-span-6">
                <Split
                  cols={2}
                  parts={rel.groups.map(g => ({
                    title: g.title,
                    children: <Bullets items={g.items} />,
                  }))}
                />
              </div>

              {/* right: what it takes away */}
              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Deprecated or removed
                </div>
                <Bullets items={rel.gone} />
                <div className="mt-2">
                  <Note label="Check this column first" tone="warn">
                    Removals are what break an upgrade, not features. Read this
                    list against your integrations before you book the window —
                    a deployment that still authenticates its API with RSA, or
                    reaches Cisco through the Transport Gateway, fails after the
                    upgrade rather than during it.
                  </Note>
                </div>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- patch cadence ---------------- */}
      <Panel title="What a patch train looks like" kicker="Per release notes" span={5} tone="quiet">
        <Table
          head={['Release', 'Patch dates']}
          widths={['14%', '86%']}
          rows={[
            [
              '3.5',
              <>GA 22 Sep 2025 · P1 15 Dec 2025 · P2 26 Feb 2026 · P3 13 Apr 2026</>,
            ],
            [
              '3.4',
              <>
                GA 4 Aug 2024 · P1 18 Dec 2024 · P2 20 Jun 2025 · P3 5 Aug 2025
                · P4 4 Nov 2025 · P5 23 Feb 2026 · P6 late Apr 2026
              </>,
            ],
            [
              '3.3',
              <>
                GA 5 Jul 2023 · P1 7 Dec 2023 · P2 18 Apr 2024 · P3 17 Jul 2024
                · P4 30 Oct 2024 · P5 10 Apr 2025 · P6 4 Jun 2025 · P7 15 Jul
                2025 · P8 17 Nov 2025 · P9 25 Dec 2025 · P10 5 Mar 2026 · P11 17
                Apr 2026
              </>,
            ],
            [
              '3.2',
              <>
                GA 16 Aug 2022 · P1 19 Jan 2023 · P2 9 May 2023 · P3 25 Jul 2023
                · P4 19 Oct 2023 · P5 16 Feb 2024 · … · P10 24 Apr 2026
              </>,
            ],
          ]}
        />
        <div className="mt-2">
          <Prose>
            Roughly a patch a quarter, accelerating when a security advisory
            lands. The version you are running is a{' '}
            <strong>train plus a patch level</strong>, and Cisco&rsquo;s
            suggested release always names both.
          </Prose>
        </div>
      </Panel>

      {/* ---------------- cross-release removals ---------------- */}
      <Panel title="Removals that outlive one release" kicker="The upgrade blockers" span={4}>
        <Table
          head={['Gone', 'Where it went']}
          widths={['40%', '60%']}
          rows={[
            [
              'pxGrid 1.0 (XMPP)',
              'Discontinued in 3.1. pxGrid 2.0 over WebSocket/REST is mandatory from that release on',
            ],
            [
              'Transport Gateway',
              'Removed across the trains — 3.2 P6, 3.3 P2, and gone in 3.4. Breaks Smart Licensing and telemetry if you relied on it',
            ],
            [
              'Legacy IPsec (ESR)',
              'Unsupported from 3.3 P2, eliminated in 3.4. Native IPsec is the replacement, from 3.3',
            ],
            [
              'RSA / RADIUS for API auth',
              'Discontinued 3.2 P7 and 3.3 P3; unsupported in 3.4',
            ],
            [
              'ACS migration tool',
              'Not supported for ISE 3.1 and later — migrate before you upgrade, not after',
            ],
            [
              'SNS 3595',
              'No longer supported from 3.3 — a hardware replacement, so plan Backup / Reimage / Restore',
            ],
          ]}
        />
      </Panel>

      {/* ---------------- smart licensing hosts ---------------- */}
      <Panel title="Smart Licensing by version" kicker="From the author's workbook" span={3} tone="quiet">
        <Stack gap={6}>
          <Prose>
            Which host ISE talks to for licensing depends on the release and
            patch level. Get this wrong in the firewall policy and registration
            fails with no obvious cause.
          </Prose>
          <KV
            items={[
              [
                '3.0 P7, 3.1 P5, 3.2+',
                <>
                  <M>smartreceiver.cisco.com</M> — <M>TCP 443</M>
                </>,
              ],
              [
                'Older releases',
                <>
                  <M>tools.cisco.com</M>, <M>tools1</M>, <M>tools2</M> —{' '}
                  <M>TCP 443</M>
                </>,
              ],
              ['3.0 and later', 'Smart Licensing only — no traditional licence files'],
              ['2.6 and later', 'SSM on-prem supported for air-gapped networks'],
            ]}
            labelWidth={86}
          />
          <Note label="When registration fails">
            Three causes, in order of likelihood: a firewall blocking the
            outbound session, DNS failing to resolve the licensing FQDN, or the
            Smart Licensing portal itself. Set{' '}
            <M>License</M> and <M>admin-license</M> to DEBUG and read{' '}
            <M>ise-psc.log</M>.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
