'use client'

// ============================================================
// Topic — Certificates & PKI
//
// The interactive panel is a usage explorer: pick a system
// certificate usage and you get what ISE presents it to, what
// must be in the subject and SAN, who has to trust it, what
// breaks the day it expires, and how to renew it.
// ============================================================

import React, { useState } from 'react'
import {
  Sheet,
  Panel,
  Table,
  KV,
  Bullets,
  Note,
  Prose,
  Stack,
  Code,
  Steps,
  Pill,
  M,
  Split,
  Selector,
} from '../sheet-kit'

interface Usage {
  id: string
  label: string
  name: string
  scope: string
  gist: string
  presented: React.ReactNode[]
  subject: [React.ReactNode, React.ReactNode][]
  trust: React.ReactNode
  expiry: React.ReactNode
  renewal: React.ReactNode[]
  note?: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const USAGES: Usage[] = [
  {
    id: 'admin',
    label: 'Admin',
    name: 'Admin',
    scope: 'Per node · restart on assignment',
    gist:
      'Secures everything on 443 — admin GUI, node registration, replication, and any usage not separately listed. The only assignment that restarts the application.',
    presented: [
      <>Browsers on the admin GUI, <M>TCP 443</M></>,
      <>Every other ISE node during registration and replication</>,
      <>Any service on the node with no more specific usage</>,
    ],
    subject: [
      ['CN', <>Node FQDN. The CSR form defaults to <M>$FQDN$</M></>],
      ['SAN', <>FQDN, short hostname, and an <M>IP Address</M> entry if anyone reaches the GUI by IP</>],
      ['Scope', 'One per node, or one wildcard bound everywhere'],
    ],
    trust: (
      <>
        Every other node — the issuer must be in Trusted Certificates with{' '}
        <strong>Trust for authentication within ISE</strong>. Plus every
        administrator&rsquo;s browser.
      </>
    ),
    expiry: (
      <>
        GUI certificate errors, registration refused, replication stalled and
        nodes falling <strong>Out of Sync</strong>. An expired certificate
        anywhere also blocks an upgrade.
      </>
    ),
    renewal: [
      <>CSR early, with a start date preceding the old expiry.</>,
      <>Bind with <strong>no usage ticked</strong> — ISE holds it dormant.</>,
      <>Tick <strong>Admin</strong> once it is inside its validity window.</>,
      <>PSNs first, PAN last. Prove it before deleting the old one.</>,
    ],
    note: {
      label: '10–15 minutes',
      tone: 'warn',
      body: (
        <>
          Assigning Admin restarts the application on that node for
          10&ndash;15 minutes. ISE 3.3 adds <strong>Schedule Application Restart
          After Admin Certificate Renewal</strong> — bind now, restart in the
          window.
        </>
      ),
    },
  },

  {
    id: 'eap',
    label: 'EAP Authentication',
    name: 'EAP Authentication',
    scope: 'Per PSN · no restart, total blast radius',
    gist:
      'The server certificate ISE presents inside the PEAP, EAP-TLS, EAP-FAST, TEAP and EAP-TTLS tunnel. No restart, and no warning — every 802.1X supplicant stops in the same second.',
    presented: [
      <>Every supplicant, in the TLS handshake carried inside EAP</>,
      <>Presented by whichever PSN answered the Access-Request</>,
      <>Validated against the supplicant&rsquo;s trust store, not ISE&rsquo;s</>,
    ],
    subject: [
      ['CN', <>A real FQDN. <strong>Never</strong> a <M>*</M> — Windows supplicants reject a wildcard CN</>],
      ['SAN', <>Every PSN FQDN, any LB VIP FQDN, and the wildcard as a <M>DNS Name</M> — leftmost label only</>],
      ['Chain', 'ISE must present server plus every intermediate'],
    ],
    trust: (
      <>
        Every supplicant on the estate. The chain must reach Windows, macOS, iOS
        and Android trust stores by GPO or MDM <em>weeks</em> before you bind.
      </>
    ),
    expiry: (
      <>
        802.1X fails instantly and everywhere for any supplicant that validates
        the server. No grace, no fallback, no partial outage.
      </>
    ),
    renewal: [
      <>Push the new issuing chain to every endpoint first, and confirm it landed.</>,
      <>CSR with usage <strong>EAP Authentication</strong>, all PSNs or one wildcard.</>,
      <>Bind dormant, then move the usage one PSN at a time, watching Live Logs.</>,
      <>Renew EAP <em>before</em> Admin — longest lead time, no restart.</>,
    ],
    note: {
      label: 'The other half of EAP-TLS',
      body: (
        <>
          Client certificates validate only if{' '}
          <strong>Trust for client authentication and Syslog</strong> is ticked
          on the issuing CA. Without it you get <M>12514 unknown CA</M> however
          correct the chain looks.
        </>
      ),
    },
  },

  {
    id: 'portal',
    label: 'Portal',
    name: 'Portal',
    scope: 'Per PSN · selected by Certificate Group Tag',
    gist:
      'HTTPS for Guest, Sponsor, My Devices, BYOD, Client Provisioning and Hotspot. A portal references a Certificate Group Tag, never a certificate directly.',
    presented: [
      <>Any browser redirected to a portal on <M>TCP 8443</M></>,
      <>Guests&rsquo; unmanaged phones and laptops</>,
      <>BYOD and Client Provisioning before onboarding completes</>,
    ],
    subject: [
      ['CN', 'The portal FQDN users are sent to'],
      [
        'SAN',
        <>
          Must contain the exact FQDN used in the <M>url-redirect</M> AV pair.
          Add an IP SAN only if the redirect really uses an IP
        </>,
      ],
      ['Group tag', <>Default <M>Default Portal Certificate Group</M></>],
    ],
    trust: (
      <>
        Devices you do not manage. This is the usage that justifies a{' '}
        <strong>public CA</strong> — an internal root means every guest sees a
        warning.
      </>
    ),
    expiry: (
      <>
        An interstitial at the moment of redirect. Guests read it as a captive-
        portal attack and give up; BYOD stops at the first page.
      </>
    ),
    renewal: [
      <>Bind the new certificate with the <strong>same Certificate Group Tag</strong>.</>,
      <>Every portal on that tag moves at once — no portal edit needed.</>,
      <>Check the redirect FQDN is a SAN on the new certificate.</>,
      <>Test through the real redirect, not by browsing to <M>:8443</M>.</>,
    ],
    note: {
      label: 'Static FQDN',
      body: (
        <>
          Set the <strong>Static Host Name / FQDN</strong> in the authorization
          profile&rsquo;s Web Redirection section. A redirect by IP cannot match
          a DNS SAN, so the warning becomes unavoidable.
        </>
      ),
    },
  },

  {
    id: 'pxgrid',
    label: 'pxGrid',
    name: 'pxGrid',
    scope: 'Per pxGrid node · mutual TLS',
    gist:
      'What ISE presents on TCP 8910 to pxGrid 2.0 subscribers and to other pxGrid nodes. Mutual TLS — both directions need a trusted chain.',
    presented: [
      <>Every subscriber on <M>TCP 8910</M>, REST and WebSocket</>,
      <>Other pxGrid nodes, for inter-node communication</>,
      <>Catalyst Center, Secure Firewall, Secure Network Analytics</>,
    ],
    subject: [
      ['CN', 'The pxGrid node FQDN'],
      ['SAN', 'FQDN and IP address of the pxGrid node'],
      [
        'Both ways',
        <>
          ISE must trust the subscriber&rsquo;s CA too —{' '}
          <strong>Trust for authentication within ISE</strong>
        </>,
      ],
    ],
    trust: (
      <>
        Every subscriber. Cisco&rsquo;s guidance: sign ISE&rsquo;s pxGrid
        certificate and every client certificate with the <strong>same
        CA</strong>, and both pxGrid nodes serving one subscriber with the same
        CA.
      </>
    ),
    expiry: (
      <>
        Subscribers drop and cannot reconnect. Session, TrustSec and ANC context
        stops. Access control is unaffected — which is why nobody notices.
      </>
    ),
    renewal: [
      <>CSR with usage <strong>pxGrid</strong>, or let the ISE internal CA issue it.</>,
      <>Reissue client certificates at <M>pxGrid Services &gt; Client Management &gt; Certificates</M>.</>,
      <>Bind, then restart each subscriber connection.</>,
      <>Accounts should return to <strong>ENABLED</strong> under <M>Clients</M>.</>,
    ],
  },

  {
    id: 'messaging',
    label: 'ISE Messaging',
    name: 'ISE Messaging Service',
    scope: 'Per node · internal CA by default',
    gist:
      'Encrypts ISE logging between nodes — the bus that replaced legacy syslog — on TCP 8671. Issued by the internal CA by default, and invisible until it is not.',
    presented: [
      <>Node to node on <M>TCP 8671</M>, TCP/SSL</>,
      <>Carries the log stream PSNs send to MnT</>,
      <>Never seen by an endpoint, NAD or browser</>,
    ],
    subject: [
      ['Issued by', 'The ISE internal CA by default; ISE 3.x can use an external CA'],
      ['CN / SAN', 'Node FQDN, generated for you by the internal CA'],
      ['Usage', <>Selectable in the CSR form as <M>ISE Messaging Service</M></>],
    ],
    trust: <>Other ISE nodes only. Nothing outside the deployment sees it.</>,
    expiry: (
      <>
        The silent one. Authentication keeps working so nobody is paged, but
        logs stop reaching MnT. <strong>Blank Live Logs while endpoints are
        plainly authenticating</strong> — check this first.
      </>
    ),
    renewal: [
      <>Check expiry on <strong>every</strong> node, not just the PAN.</>,
      <>Let the internal CA reissue, or CSR with usage <strong>ISE Messaging Service</strong>.</>,
      <>Regenerating the ISE Root CA reissues these — but read the CA warning first.</>,
    ],
  },

  {
    id: 'saml',
    label: 'SAML',
    name: 'SAML',
    scope: 'Per node · IdP-facing',
    gist:
      'The server certificate securing communication with the SAML identity provider. In play for SAML admin login and SAML-authenticated guest and sponsor portals.',
    presented: [
      <>The SAML identity provider during the SAML exchange</>,
      <>Used alongside the Portal certificate, not instead of it</>,
    ],
    subject: [
      ['CN', 'The node FQDN the IdP is configured to talk to'],
      ['SAN', 'Whatever name the IdP metadata carries — mismatch is the usual failure'],
      ['Pairing', 'The IdP signing certificate goes into Trusted Certificates'],
    ],
    trust: <>The identity provider. Some IdPs pin the certificate, not the chain.</>,
    expiry: (
      <>
        SAML admin login and SAML portal login fail. If SAML is your only admin
        login path, you are down to the local account and CLI recovery.
      </>
    ),
    renewal: [
      <>Bind the new certificate with usage <strong>SAML</strong>.</>,
      <>Re-export the ISE service-provider metadata and re-import it at the IdP.</>,
      <>Keep a working local admin account — SAML is the path you are breaking.</>,
    ],
  },

  {
    id: 'ca',
    label: 'Internal CA',
    name: 'ISE Internal CA — Certificate Services',
    scope: 'PAN root · Endpoint Sub CA per PSN',
    gist:
      'Not a usage but the PKI ISE runs for itself: it signs endpoint CSRs for BYOD onboarding, issues ISE Messaging certificates, can issue pxGrid certificates, and runs its own OCSP responder.',
    presented: [
      <>Endpoint certificates for BYOD-onboarded devices</>,
      <>ISE Messaging Service certificates on every node</>,
      <>An OCSP responder on <M>TCP 2560</M>; SCEP on <M>TCP 9090</M></>,
    ],
    subject: [
      ['Root', 'Certificate Services Root CA — self-signed, on the PAN'],
      ['Node CA', 'Signed by the Root CA, also on the PAN'],
      [
        'Per PSN',
        <>
          Endpoint Sub CA and Endpoint RA. From ISE 3.1 P2 the OCSP responder
          certificate is issued by the node&rsquo;s own Endpoint Sub CA
        </>,
      ],
    ],
    trust: (
      <>
        Only devices ISE itself onboards — they get the chain during BYOD
        registration. Nothing outside the deployment should be asked to trust
        it.
      </>
    ),
    expiry: (
      <>
        Every endpoint certificate it issued becomes untrusted. Regenerating the
        Root CA does the same deliberately:{' '}
        <strong>every BYOD device must re-onboard</strong>.
      </>
    ),
    renewal: [
      <>Regenerate at <M>Generate CSR &gt; ISE Root CA</M> — replaces the whole chain. Break-glass only.</>,
      <><strong>Export Cisco ISE CA Certificates and Keys</strong> before promoting a new PAN.</>,
      <>Import them onto the new PAN as part of the promotion.</>,
    ],
    note: {
      label: 'Internal or enterprise CA?',
      tone: 'good',
      body: (
        <>
          Internal CA for endpoint certificates and the messaging bus.
          Enterprise or public CA for anything a human, a browser or a
          supplicant validates — Admin, EAP, Portal. Mixing the two is correct.
        </>
      ),
    },
  },
]

export default function CertsSheet() {
  const [usageId, setUsageId] = useState(USAGES[0].id)
  const usage = USAGES.find(u => u.id === usageId) ?? USAGES[0]

  return (
    <Sheet>
      {/* ---------------- the two stores ---------------- */}
      <Panel title="Two stores, and only two" span={4}>
        <Stack gap={6}>
          <Prose>
            <strong>System Certificates</strong> are what ISE presents, each with
            a private key that never leaves its node.{' '}
            <strong>Trusted Certificates</strong> are the CAs ISE validates
            against — that store lives on the PAN and replicates everywhere.
          </Prose>
          <KV
            items={[
              [
                'Both at',
                <M>Administration &gt; System &gt; Certificates &gt; Certificate Management</M>,
              ],
              ['Format', 'PEM or DER. Nothing else imports'],
              [
                'At install',
                <>
                  A <strong>Default Self-Signed Server Certificate</strong> is
                  assigned to EAP, Admin, Portal and RADIUS DTLS. Replace all four
                </>,
              ],
            ]}
            labelWidth={54}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'The four trust flags on an imported CA',
                children: (
                  <Bullets
                    items={[
                      <><strong>Authentication within ISE</strong> — node registration and replication</>,
                      <><strong>Client authentication and Syslog</strong> — validates EAP-TLS client certificates and syslog peers. <em>The forgotten one</em></>,
                      <><strong>Certificate based admin authentication</strong> — smart card / CAC login</>,
                      <><strong>Authentication of Cisco Services</strong> — feed service, Smart Licensing</>,
                    ]}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- usages table ---------------- */}
      <Panel title="The system-certificate usages" kicker="What each breaks" span={5} tone="signal">
        <Table
          head={['Usage', 'Secures', 'If it is wrong or expired']}
          widths={['19%', '40%', '41%']}
          rows={[
            [
              'Admin',
              <>All communication over <M>443</M> — GUI, registration, replication, and anything unlisted</>,
              <>GUI warnings, registration and replication fail. <strong>Assignment restarts the app, 10&ndash;15 min</strong></>,
            ],
            [
              'EAP Authentication',
              'The server certificate inside PEAP, EAP-TLS, EAP-FAST, TEAP, EAP-TTLS',
              'Every 802.1X supplicant that validates the server rejects it. Instant, estate-wide',
            ],
            [
              'RADIUS DTLS',
              <>RADIUS between NAD and ISE over <M>UDP 2083</M></>,
              'DTLS-configured NADs stop authenticating',
            ],
            [
              'Portal',
              'Guest, Sponsor, My Devices, BYOD, Client Provisioning, Hotspot',
              'Warning at redirect. Bound by Certificate Group Tag, not per portal',
            ],
            [
              'pxGrid',
              <>Mutual TLS to pxGrid 2.0 subscribers, <M>TCP 8910</M></>,
              'Subscribers drop, context stops. Access control unaffected',
            ],
            ['SAML', 'Communication with the SAML identity provider', 'SAML admin and portal logins fail'],
            [
              'ISE Messaging',
              <>The node-to-node log bus that replaced syslog, <M>TCP 8671</M></>,
              <><strong>Live Logs go blank while authentication still works</strong></>,
            ],
          ]}
        />
      </Panel>

      {/* ---------------- internal CA ---------------- */}
      <Panel title="ISE Internal CA hierarchy" span={3} tone="quiet">
        <Stack gap={6}>
          <Code
            title="Certificates > Certificate Authority"
            code={`PAN
 └ Certificate Services Root CA  (self-signed)
    └ Certificate Services Node CA
       ├ Endpoint Sub CA   (per PSN)
       │   └ OCSP Responder (per node)
       └ Endpoint RA       (per PSN)`}
          />
          <Bullets
            items={[
              <>Signs endpoint CSRs for BYOD; issues ISE Messaging and optionally pxGrid certificates</>,
              <>OCSP responder on <M>2560</M>, SCEP on <M>9090</M></>,
              <>EST and CA services run only on a PSN with session services</>,
            ]}
          />
          <Note label="Break-glass" tone="warn">
            Regenerating the Root CA invalidates every endpoint certificate
            issued — all BYOD devices re-onboard. Export the CA certificates and
            keys before promoting a new PAN.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- THE USAGE EXPLORER ---------------- */}
      <Panel
        title="Certificate usage explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Presented to whom, trusted by whom, renewed how
          </span>
        }
      >
        <Stack gap={7}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={USAGES.map(u => ({ id: u.id, label: u.label, hint: u.gist }))}
              value={usageId}
              onChange={setUsageId}
            />
            <Pill tone="neutral">{usage.scope}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {usage.name}
                </h4>
                <div className="mt-1">
                  <Prose>{usage.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Presented to
                  </div>
                  <Bullets items={usage.presented} />
                </div>
              </div>

              <div className="col-span-4">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Subject and SAN
                </div>
                <KV items={usage.subject} labelWidth={58} />
                <div className="mt-1.5">
                  <Prose>
                    <strong>Must be trusted by:</strong> {usage.trust}
                  </Prose>
                </div>
                {usage.note && (
                  <div className="mt-1.5">
                    <Note label={usage.note.label} tone={usage.note.tone}>
                      {usage.note.body}
                    </Note>
                  </div>
                )}
              </div>

              <div className="col-span-4">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  When it expires
                </div>
                <Prose>{usage.expiry}</Prose>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Renewal
                  </div>
                  <Steps items={usage.renewal} />
                </div>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- CSR ---------------- */}
      <Panel title="Generating and binding a CSR" span={4}>
        <Stack gap={6}>
          <Steps
            items={[
              <><M>Certificate Signing Requests &gt; Generate CSR</M>, then pick the <strong>usage</strong> — Admin, EAP, Portal, pxGrid, RADIUS DTLS, SAML, ISE Messaging, Multi-Use, ISE Root/Intermediate CA</>,
              <>Tick the nodes — one CSR each, or <strong>Allow Wildcard Certificates</strong> for one shared</>,
              <>Fill Subject (CN, OU, O, L, ST, C) and the SAN rows</>,
              <>Export the PEM, get it signed, then <strong>Bind Certificate</strong> — friendly name, usage boxes, Submit</>,
            ]}
          />
          <KV
            items={[
              ['Key type', 'RSA or ECDSA'],
              ['RSA', <><M>512</M> <M>1024</M> <M>2048</M> <M>4096</M></>],
              ['ECDSA', <><M>256</M> <M>384</M></>],
              ['Digest', 'SHA-256, SHA-384 or SHA-512'],
              [
                'Cisco says',
                <>
                  <strong>2048</strong> for a public-CA certificate or a
                  FIPS-compliant deployment
                </>,
              ],
              ['SAN types', 'DNS Name · IP Address · URI · Directory Name'],
            ]}
            labelWidth={54}
          />
        </Stack>
      </Panel>

      {/* ---------------- SAN and wildcards ---------------- */}
      <Panel title="SAN entries and wildcards" span={4} tone="quiet">
        <Stack gap={6}>
          <Code
            title="A SAN set that actually works"
            code={`CN = ise-psn-01.corp.example.com

SAN  DNS Name    ise-psn-01.corp.example.com
SAN  DNS Name    ise-psn-01
SAN  DNS Name    ise.corp.example.com     # LB VIP
SAN  DNS Name    guest.corp.example.com   # portal
SAN  DNS Name    *.corp.example.com       # wildcard
SAN  IP Address  10.1.1.11`}
          />
          <Bullets
            items={[
              <>Modern browsers and supplicants ignore the CN entirely — every name anyone will use must be a SAN</>,
              <>The <M>*</M> belongs in a SAN <strong>DNS Name</strong> and nowhere else; Microsoft supplicants reject a wildcard CN</>,
              <>Leftmost label only — <M>abc*.example.com</M> is not valid. Partition the domain: <M>*.amer.example.com</M></>,
              <>One recovered wildcard private key spoofs every server in the domain. Keep all ISE hostnames lowercase</>,
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- revocation ---------------- */}
      <Panel title="Revocation — OCSP and CRL" kicker="Per trusted CA" span={4}>
        <Stack gap={6}>
          <Prose>
            Configured on the issuing CA, not globally:{' '}
            <M>Trusted Certificates &gt; CA &gt; Edit &gt; Certificate Status Validation</M>.
            OCSP for scale, CRL as the fallback.
          </Prose>
          <Split
            parts={[
              {
                title: 'OCSP',
                children: (
                  <Bullets
                    items={[
                      <>Build the profile at <M>OCSP Client Profile</M> — responder URL, secondary server, nonce, cache TTL</>,
                      <>Bind with <strong>Validate against OCSP Service</strong></>,
                      <>Tick <strong>Reject if UNKNOWN</strong> and <strong>Reject if responder unreachable</strong>, or the check is advisory</>,
                    ]}
                  />
                ),
              },
              {
                title: 'CRL',
                children: (
                  <Bullets
                    items={[
                      <>Distribution URL over HTTP <M>80</M>, HTTPS <M>443</M> or LDAP <M>389</M></>,
                      <>Retrieve before expiry or on a period; set a retry wait</>,
                      <>Never tick <strong>Bypass CRL Verification if CRL is not Received</strong> — it makes revocation a no-op</>,
                    ]}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- renewal + mistakes strip ---------------- */}
      <Panel title="Renewal without an outage, and the mistakes people make" span={12} tone="signal">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4">
            <div
              className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              The overlap strategy
            </div>
            <Steps
              items={[
                <>Generate the CSR before the current certificate expires.</>,
                <>Have the CA issue with a start date that <strong>precedes</strong> the old expiry.</>,
                <>Bind on ISE with <strong>no usage assigned</strong>; ISE holds it dormant.</>,
                <>Once it is inside its valid range, tick the usage boxes.</>,
                <>Admin assignment triggers the restart — schedule it.</>,
                <>Never delete the old certificate until the new one is proven.</>,
              ]}
            />
          </div>
          <div className="col-span-4">
            <div
              className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Order, and the errors you will meet
            </div>
            <Bullets
              items={[
                <><strong>EAP first</strong>, once the chain is already in every trust store — then PSN by PSN, then <strong>Admin last</strong>, PAN after the PSNs</>,
                <>Renew everything expired <em>before</em> an upgrade; expired certificates fail it</>,
                <><M>12514</M> — client-cert CA missing, or its client-authentication flag not ticked</>,
                <><M>12516</M> — expired certificate in the client chain</>,
                <><strong>Certificate Already Exists</strong> — identical Subject; change City, State or OU</>,
              ]}
            />
          </div>
          <div className="col-span-4">
            <Note label="The classic three">
              <strong>One certificate for everything</strong> — a single
              Multi-Use certificate ties the EAP outage window to the Admin
              restart window, so you can never renew one without risking the
              other. <strong>A portal certificate whose FQDN is not the redirect
              URL</strong> — the SAN must contain exactly what the{' '}
              <M>url-redirect</M> AV pair sends the browser to, which is why a
              redirect by IP always warns. <strong>A missing
              intermediate</strong> — ISE presents only what it holds, so an
              incomplete chain fails on the client even though the root is
              trusted everywhere. Packet-capture the EAP exchange to see what
              ISE actually sends.
            </Note>
          </div>
        </div>
      </Panel>
    </Sheet>
  )
}
