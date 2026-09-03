'use client'

// ============================================================
// Topic — Identity Stores & Active Directory
//
// The interactive panel is the store explorer: pick an identity
// store and you get what it can authenticate, which EAP methods
// survive against it, where it is configured and what it cannot
// do. Active Directory gets the static panels around it, because
// it is the store that actually breaks.
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
  Pill,
  M,
  Split,
  Selector,
} from '../sheet-kit'

interface Store {
  id: string
  label: string
  name: string
  kind: 'internal' | 'external' | 'cloud'
  gist: string
  supports: React.ReactNode[]
  eap: React.ReactNode
  path: React.ReactNode
  config?: { title: string; code: string }
  limits: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const EXT = (
  <M>Administration &gt; Identity Management &gt; External Identity Sources</M>
)

const STORES: Store[] = [
  {
    id: 'ad',
    label: 'Active Directory',
    name: 'Active Directory',
    kind: 'external',
    gist:
      'The only external store that does everything: password authentication for users and machines, group and attribute retrieval, certificate retrieval and binary comparison. It is also the store with the most ways to fail.',
    supports: [
      <>User <strong>and</strong> machine authentication, with password change</>,
      <>Groups and attributes retrieval — <M>AD:ExternalGroups</M> and anything added on the Attributes tab</>,
      <>Certificate retrieval and <strong>binary certificate comparison</strong> against <M>userCertificate</M></>,
      <>Multi-join: up to <strong>50</strong> AD joins per deployment and <strong>200</strong> domain controllers in total</>,
      <><strong>Scopes</strong> group several join points so one authentication rule can span forests</>,
    ],
    eap: (
      <>
        PEAP-MSCHAPv2, EAP-FAST-MSCHAPv2, TEAP, EAP-TTLS, EAP-TLS, PEAP-TLS,
        EAP-GTC, PAP/ASCII, LEAP (user only). Not EAP-MD5 or CHAP.
      </>
    ),
    path: (
      <>
        {EXT} &gt; <strong>Active Directory</strong> — add a join point, then
        join each node. Groups, Attributes and Advanced Settings are tabs on the
        join point.
      </>
    ),
    config: {
      title: 'What must be true before the join succeeds',
      code: `DNS   forward AND reverse for every DC and every ISE node
      SRV records answered for:
        _ldap._tcp.<domain>
        _gc._tcp.<forest>
        _kerberos._tcp.<domain>
        _ldap._tcp.<site>._sites.<domain>
      authoritative servers, not public resolvers

NTP   ISE and the DCs time-synchronised (Kerberos requirement)

Join account rights
      search AD for an existing ISE machine account
      create the machine account in the target OU
      set attributes on it (password, SPN, dnsHostname)
      -- credentials are NOT stored; only the machine account is

Machine account password rotates every 15 days`,
    },
    limits: {
      label: 'Windows Server caveats',
      tone: 'warn',
      body: (
        <>
          On Windows Server 2016 and later the{' '}
          <em>Network access: Restrict clients allowed to make remote calls to
          SAM</em> policy can stop ISE updating its machine account password
          every 15 days; the fix is to blank{' '}
          <M>HKLM\SYSTEM\CurrentControlSet\Control\Lsa\restrictremotesam</M>. On
          Windows Server 2025 the hotpatch <M>KB5068861</M> or a later
          cumulative update is required. Joining makes ISE a member of
          Authenticated Users, itself a member of Pre-Windows 2000 — do not
          disable that group.
        </>
      ),
    },
  },

  {
    id: 'ldap',
    label: 'LDAP',
    name: 'LDAP directory',
    kind: 'external',
    gist:
      'Any RFC-compliant directory — OpenLDAP, Sun, eDirectory, or AD accessed as plain LDAP. Cheap to add and read-only, but it can never do MS-CHAP, which rules out the most common password method on Windows.',
    supports: [
      <>Subject and group lookup, group and attribute retrieval</>,
      <>Certificate retrieval for EAP-TLS, via the <strong>Certificate Attribute</strong> field</>,
      <>Primary and secondary servers with failover</>,
      <>MAC address search formats: <M>xxxx.xxxx.xxxx</M>, <M>xx-xx-xx-xx-xx-xx</M>, <M>xx:xx:xx:xx:xx:xx</M>, <M>xxxxxxxxxxxx</M></>,
    ],
    eap: (
      <>
        PAP/ASCII, EAP-GTC, EAP-TLS and PEAP-TLS (certificate retrieval),
        EAP-TTLS with inner PAP. <strong>Not</strong> MS-CHAPv1/v2,
        EAP-MSCHAPv2, PEAP-MSCHAPv2, EAP-MD5 or CHAP.
      </>
    ),
    path: (
      <>
        {EXT} &gt; <strong>LDAP</strong>. General tab sets the schema —
        Active Directory, Sun, Novell eDirectory, OpenLDAP or Custom — plus
        Subject Objectclass, Subject Name Attribute, Group Objectclass and
        Group Map Attribute.
      </>
    ),
    config: {
      title: 'Connection and Directory Organization tabs',
      code: `Connection
  Primary / Secondary hostname or IP
  Port           389   (LDAP)
                 636   (LDAPS, Enable Secure Authentication + Root CA)
  Access         Anonymous, or Authenticated with Admin DN + password
  Server Timeout, Max. Admin Connections, Force reconnect every N sec
  [Test Bind to Server]

Directory Organization
  Subject Search Base    ou=People,dc=example,dc=com
  Group Search Base      ou=Groups,dc=example,dc=com
  Search for MAC Address in Format
  Strip start of subject name up to the last separator
  Strip end of subject name from the first separator`,
    },
    limits: {
      label: 'Why MS-CHAP cannot work here',
      body: (
        <>
          MS-CHAPv2 is a challenge-response against the NT hash. LDAP hands ISE
          either a plaintext password (via a bind) or a certificate — never a
          hash it can compute against. So an LDAP-backed 802.1X design has to be{' '}
          <strong>EAP-TLS</strong>, or a tunnel with inner{' '}
          <strong>PAP</strong> or <strong>GTC</strong>: EAP-TTLS/PAP is the
          usual answer, which is why eduroam is built that way.
        </>
      ),
    },
  },

  {
    id: 'odbc',
    label: 'ODBC',
    name: 'ODBC database',
    kind: 'external',
    gist:
      'A relational database reached through stored procedures you write yourself. Unusual among external stores in that it can return the plaintext password, which unlocks the whole challenge-response family.',
    supports: [
      <>Microsoft SQL Server, Oracle, PostgreSQL, Sybase, MySQL</>,
      <>Stored procedures you must create: plain-text password authentication, plain-text password fetch, check username or machine exists, fetch groups, fetch attributes</>,
      <>Group and attribute retrieval from your own schema</>,
    ],
    eap: (
      <>
        The widest external coverage: PAP/ASCII, CHAP, MS-CHAPv1/v2,
        EAP-MSCHAPv2 (so PEAP-MSCHAPv2 and EAP-FAST-MSCHAPv2), EAP-MD5 and
        EAP-GTC. <strong>Not</strong> EAP-TLS — it holds no certificates.
      </>
    ),
    path: (
      <>
        {EXT} &gt; <strong>ODBC</strong>. Configure the connection, then map
        each stored procedure on the Stored Procedures tab and test it from the
        page.
      </>
    ),
    limits: {
      label: 'Where to look when it fails',
      body: (
        <>
          ODBC debug lands in <M>prrt-management.log</M>. Almost every failure
          is the stored procedure&rsquo;s return contract rather than
          connectivity — test each procedure from the ISE page, not from a SQL
          client, because ISE checks the shape of what comes back.
        </>
      ),
    },
  },

  {
    id: 'internalusers',
    label: 'Internal Users',
    name: 'Internal Users',
    kind: 'internal',
    gist:
      'The local user database. Widest protocol support of any store and no external dependency, which makes it the right home for network-admin TACACS+ accounts and break-glass credentials — and the wrong home for a workforce.',
    supports: [
      <>Name, status, email, password lifetime and account disable policy</>,
      <><strong>Login Password</strong> and <strong>Enable Password</strong> — the second is the TACACS+ enable secret</>,
      <>User identity groups, plus custom user attributes</>,
      <>Password policy at <M>Administration &gt; Identity Management &gt; Settings &gt; User Authentication Settings</M></>,
    ],
    eap: (
      <>
        PAP/ASCII, CHAP, MS-CHAPv1/v2, EAP-MD5, EAP-MSCHAPv2 (PEAP-MSCHAPv2,
        EAP-FAST-MSCHAPv2, TEAP), EAP-GTC, LEAP.
      </>
    ),
    path: (
      <>
        <M>Administration &gt; Identity Management &gt; Identities &gt; Users</M>.
        Custom attributes are defined at{' '}
        <M>Administration &gt; Identity Management &gt; Settings &gt; User Custom Attributes</M>.
      </>
    ),
    limits: {
      label: 'No certificates',
      body: (
        <>
          Internal Users hold no <M>userCertificate</M>, so an EAP-TLS
          authentication resolved to this store is a <em>presence check</em>{' '}
          only — a CAP with Identity Store set to Internal Users and no binary
          comparison. If you need the certificate proven against the account,
          the store has to be AD or LDAP.
        </>
      ),
    },
  },

  {
    id: 'endpoints',
    label: 'Internal Endpoints',
    name: 'Internal Endpoints',
    kind: 'internal',
    gist:
      'The endpoint database — the store MAB queries. Its identity is a MAC address, so it authenticates nothing in any real sense; it answers "have I seen this MAC, and which group is it in".',
    supports: [
      <>MAB lookups, using the MAC as both username and password</>,
      <>Endpoint identity groups: <M>Blocklist</M>, <M>GuestEndpoints</M>, <M>Profiled</M> (with <M>Cisco-IP-Phone</M> and <M>Workstation</M>), <M>RegisteredDevices</M>, <M>Unknown</M></>,
      <>Static assignment (<M>StaticGroupAssignment = true</M>) or dynamic assignment by the profiler</>,
      <>Pairs with the <M>MAC_in_SAN</M> condition for IoT certificates carrying a MAC in the SAN</>,
    ],
    eap: (
      <>
        None. MAB is not EAP — it is a host lookup, enabled by{' '}
        <strong>Process Host Lookup</strong> in the allowed protocols service.
      </>
    ),
    path: (
      <>
        <M>Administration &gt; Identity Management &gt; Identities &gt; Endpoints</M>;
        groups at{' '}
        <M>Administration &gt; Identity Management &gt; Groups &gt; Endpoint Identity Groups</M>.
      </>
    ),
    limits: {
      label: 'It purges',
      tone: 'warn',
      body: (
        <>
          Endpoint Purge (
          <M>Administration &gt; Identity Management &gt; Settings &gt; Endpoint Purge</M>
          ) deletes endpoints and registered devices older than 30 days by
          default, and the job runs at 1:00 a.m. daily. A statically-added
          printer allow-list can quietly evaporate — exclude the group from
          purge, or accept that MAB will start failing.
        </>
      ),
    },
  },

  {
    id: 'token',
    label: 'RADIUS Token / RSA',
    name: 'RADIUS Token server and RSA SecurID',
    kind: 'external',
    gist:
      'One-time-password back ends. ISE proxies the passcode and gets a yes or no; it never sees a reusable credential, which is precisely why so little works against them.',
    supports: [
      <>RADIUS Token: primary and secondary host, shared secret, authentication port <M>1812</M>, server timeout, connection attempts</>,
      <>Failover choice: <em>always access primary first</em>, or <em>fall back to primary after N minutes</em></>,
      <>RSA SecurID: configured by uploading <M>sdconf.rec</M>; ISE generates and stores a node secret per PSN</>,
      <>RSA tabs: Instance Files, Options, Prompts (passcode, next token code, new PIN), Messages</>,
    ],
    eap: (
      <>
        <strong>PAP/ASCII and EAP-GTC only</strong>. In practice that means
        PEAP-GTC or EAP-TTLS with inner GTC — never PEAP-MSCHAPv2.
      </>
    ),
    path: (
      <>
        {EXT} &gt; <strong>RADIUS Token</strong>, or {EXT} &gt;{' '}
        <strong>RSA SecurID</strong>. The Authentication tab decides how ISE
        treats an Access-Reject from the token server; the Authorization tab
        names the attribute carrying group information.
      </>
    ),
    limits: {
      label: 'The supplicant has to cooperate',
      body: (
        <>
          GTC prompts the user for a passcode mid-authentication. Native
          Windows and macOS supplicants handle PEAP-GTC poorly or not at all,
          so OTP-backed 802.1X usually needs a third-party supplicant. OTP is a
          far better fit for VPN and device administration than for wired
          802.1X.
        </>
      ),
    },
  },

  {
    id: 'saml',
    label: 'SAML IdP',
    name: 'SAML identity provider',
    kind: 'cloud',
    gist:
      'Browser-based single sign-on for the ISE portals. It is a portal store, not a RADIUS store — no 802.1X authentication ever reaches a SAML IdP.',
    supports: [
      <>Sponsor, Guest, My Devices and BYOD portal authentication</>,
      <>Entra ID, Okta, PingFederate, ADFS, Oracle Access Manager</>,
      <>Group membership carried in an assertion attribute; an Identity Attribute and Email Attribute are named in Advanced Settings</>,
      <>Multi-value attribute delimiter and logout settings</>,
    ],
    eap: (
      <>
        None. SAML is a browser redirect flow; it cannot participate in an EAP
        conversation.
      </>
    ),
    path: (
      <>
        {EXT} &gt; <strong>SAML Id Providers</strong>. Create the IdP object,
        export ISE&rsquo;s <strong>Service Provider Info</strong> metadata (ACS
        URL and entity ID), import it at the IdP, then import the IdP metadata
        back into ISE.
      </>
    ),
    limits: {
      label: 'Needs a SAML system certificate',
      body: (
        <>
          ISE signs the SAML requests with a system certificate carrying the{' '}
          <strong>SAML</strong> usage. Reissue that certificate and the IdP
          trust breaks even though the portal still loads — re-export the
          service provider metadata after any SAML certificate change.
        </>
      ),
    },
  },

  {
    id: 'entra',
    label: 'Entra ID',
    name: 'Microsoft Entra ID (Azure AD)',
    kind: 'cloud',
    gist:
      'The store for organisations with no domain controllers left. What it can do depends sharply on version: password proxy from 3.0, certificate-based authentication from 3.2.',
    supports: [
      <><strong>ISE 3.0 / 3.1</strong>: ROPC only — the OAuth Resource Owner Password Credentials grant, configured under <strong>REST (ROPC)</strong>. Groups and attributes come from Graph API</>,
      <><strong>ISE 3.2 and later</strong>: certificate-based authentication — EAP-TLS, and TEAP with EAP-TLS as the inner method</>,
      <>Authorization attributes are fetched from <strong>Microsoft Graph API</strong> after the identity is extracted</>,
      <>Requires an <strong>App Registration</strong> in Entra ID with Graph API permissions granted to the ISE app</>,
    ],
    eap: (
      <>
        3.2+: EAP-TLS and TEAP (inner EAP-TLS). Earlier releases: password
        methods only, proxied through ROPC.
      </>
    ),
    path: (
      <>
        {EXT} &gt; <strong>REST (ROPC)</strong> for the password flow; the
        certificate flow is wired through a Certificate Authentication Profile
        instead.
      </>
    ),
    config: {
      title: 'CAP settings for Entra ID certificate authentication',
      code: `Identity Store                          Not Applicable
Use Identity From                       Subject - Common Name
Match Client Certificate against
  Certificate in Identity Store         Never

Requirements
  certificate Subject CN  ==  the user's UPN in Entra ID
  root CA and every intermediate CA in the ISE Trusted Store
  App Registration in Entra ID with Graph API permission

Debug
  rest-id-store   -> rest-id-store.log
  runtime-AAA     -> prrt-server.log`,
    },
    limits: {
      label: 'User authentication only',
      tone: 'warn',
      body: (
        <>
          Cisco is explicit that only user authentication is supported against
          Entra ID — there is no machine authentication, so machine-then-user
          designs and TEAP EAP chaining against Entra ID do not work the way
          they do against AD. The identity match is rigid too: the
          certificate&rsquo;s Subject CN must equal the UPN on the Entra side.
        </>
      ),
    },
  },
]

export default function IdentitySheet() {
  const [storeId, setStoreId] = useState(STORES[0].id)
  const store = STORES.find(s => s.id === storeId) ?? STORES[0]

  return (
    <Sheet>
      {/* ---------------- AD prerequisites ---------------- */}
      <Panel
        title="Active Directory — join points, scopes and the ports"
        kicker="The store that actually breaks"
        span={7}
        tone="signal"
      >
        <Stack gap={7}>
          <Prose>
            A <strong>join point</strong> is one AD domain that a set of ISE
            nodes joins; a <strong>scope</strong> is a container grouping
            several join points so one authentication rule can reach multiple
            forests. The AD connector is internal to ISE — no agent is
            installed on a domain controller. That is a different thing from
            the PassiveID <em>AD Agent</em>, which is.
          </Prose>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-7">
              <Table
                head={['Protocol', 'Port', 'Target', 'Purpose']}
                widths={['26%', '16%', '24%', '34%']}
                rows={[
                  ['DNS', <M key="a">TCP/UDP 53</M>, 'DNS servers, DCs', 'Name resolution and SRV lookups'],
                  ['MSRPC / SMB', <M key="b">TCP 445</M>, 'Domain controllers', 'RPC, machine account operations, DC discovery'],
                  ['Kerberos', <M key="c">TCP/UDP 88</M>, 'Domain controllers', 'Authentication'],
                  ['LDAP', <M key="d">TCP/UDP 389</M>, 'Domain controllers', 'Directory queries and CLDAP pings'],
                  ['LDAP Global Catalog', <M key="e">TCP 3268</M>, 'Global catalog servers', 'Forest-wide lookups'],
                  ['KPASSWD', <M key="f">TCP 464</M>, 'Domain controllers', 'Machine account password change'],
                  ['NTP', <M key="g">UDP 123</M>, 'NTP servers or DCs', 'Time synchronisation'],
                  ['WMI', <M key="h">TCP 135</M>, 'Domain controllers', 'PassiveID / Easy Connect collection'],
                  ['LDAPS', <M key="i">TCP 636 / 3269</M>, 'DCs and GCs', 'Secure LDAP for the LDAP identity source'],
                ]}
              />
            </div>
            <div className="col-span-5">
              <KV
                items={[
                  ['Scale', <>Up to <strong>50</strong> AD joins per deployment and <strong>200</strong> DCs in total across all joins</>],
                  ['Domain discovery', <>A three-phase process, re-run every <strong>2 hours</strong> by default</>],
                  ['DC selection', <>DNS SRV plus <strong>CLDAP pings</strong> to rank DCs, with a <strong>Preferred Domain Controllers</strong> list to override</>],
                  ['Machine account', <>Password rotated every <strong>15 days</strong>; join credentials are never stored</>],
                  ['Identity Rewrite', <>Square-bracket variables — <M>[IDENTITY]</M>, <M>[DOMAIN]</M>; the preset strips <M>DOMAIN\user</M> to <M>user</M></>],
                  ['Identity Resolution', <>Reject requests without domain markup · search the joined forest only (default) · search all trusted forests</>],
                ]}
                labelWidth={80}
              />
            </div>
          </div>

          <Note label="Time and DNS before anything else">
            Kerberos requires ISE and the domain controllers to be
            time-synchronised, and DNS must answer both forward and reverse
            queries as well as SRV records for DCs, global catalogs and KDCs.
            Point ISE at authoritative internal servers, never at a public
            resolver. When a join fails, run the join point&rsquo;s{' '}
            <strong>Diagnostic Tool</strong> first — it tests DNS, connectivity,
            DC availability, Kerberos, clock skew and the machine account before
            you touch anything.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- the stores at a glance ---------------- */}
      <Panel title="Which store answers which protocol" kicker="Read down your EAP method" span={5}>
        <Stack gap={6}>
          <Table
            head={['Protocol', 'Int.', 'AD', 'LDAP', 'Token', 'RSA', 'ODBC']}
            widths={['40%', '10%', '10%', '10%', '10%', '10%', '10%']}
            align={['left', 'center', 'center', 'center', 'center', 'center', 'center']}
            rows={[
              ['EAP-GTC, PAP/ASCII', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
              [
                <>MS-CHAPv1/v2, EAP-MSCHAPv2<div className="font-normal text-ink-400">incl. PEAP-MSCHAPv2, EAP-FAST-MSCHAPv2</div></>,
                'Yes', 'Yes', '—', '—', '—', 'Yes',
              ],
              ['EAP-MD5, CHAP', 'Yes', '—', '—', '—', '—', 'Yes'],
              [
                <>EAP-TLS, PEAP-TLS, EAP-FAST-TLS<div className="font-normal text-ink-400">certificate retrieval / binary comparison</div></>,
                '—', 'Yes', 'Yes', '—', 'Yes', '—',
              ],
              ['LEAP', 'Yes', 'Yes', '—', '—', '—', '—'],
            ]}
          />
          <Note label="The rule behind the table">
            A store can only serve a protocol whose credential it can actually
            see. Challenge-response methods need the password hash, so they
            work against the internal database, AD and ODBC and nowhere else.
            Certificate methods need a stored certificate, which the internal
            user database does not have. Everything else is a plaintext
            password, which is why <M>PAP/ASCII</M> and <M>EAP-GTC</M> work
            everywhere.
          </Note>
          <Prose>
            SAML and Entra ID sit outside this table: SAML is portal-only, and
            Entra ID is reached either through the ROPC password flow or, from{' '}
            <strong>ISE 3.2</strong>, through certificate-based EAP-TLS and TEAP.
          </Prose>
        </Stack>
      </Panel>

      {/* ---------------- THE STORE EXPLORER ---------------- */}
      <Panel
        title="Identity store explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            What it supports · which EAP methods survive · where it is configured
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={STORES.map(s => ({ id: s.id, label: s.label, hint: s.gist }))}
              value={storeId}
              onChange={setStoreId}
            />
            <Pill
              tone={
                store.kind === 'internal'
                  ? 'good'
                  : store.kind === 'cloud'
                    ? 'neutral'
                    : 'bad'
              }
            >
              {store.kind === 'internal'
                ? 'Internal to ISE'
                : store.kind === 'cloud'
                  ? 'Cloud identity'
                  : 'External store'}
            </Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {store.name}
                </h4>
                <div className="mt-1">
                  <Prose>{store.gist}</Prose>
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    What it supports
                  </div>
                  <Bullets items={store.supports} />
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  EAP methods that work against it
                </div>
                <Prose>{store.eap}</Prose>

                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Where it is configured
                  </div>
                  <Prose>{store.path}</Prose>
                </div>
              </div>

              <div className="col-span-5">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Constraints
                </div>
                {store.config ? (
                  <Code title={store.config.title} code={store.config.code} />
                ) : null}
                <div className={store.config ? 'mt-2' : undefined}>
                  <Note label={store.limits.label} tone={store.limits.tone}>
                    {store.limits.body}
                  </Note>
                </div>
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- MAR ---------------- */}
      <Panel title="Machine Access Restriction" kicker="And why TEAP replaced it" span={4}>
        <Stack gap={6}>
          <Prose>
            MAR enforces that a valid <strong>machine</strong> authentication
            preceded the <strong>user</strong> authentication on the same
            endpoint, within a configurable window. ISE caches the MAC address
            and the timestamp of the last successful machine authentication; a
            later user authentication from that MAC sets{' '}
            <M>Network Access:WasMachineAuthenticated = True</M>, which you then
            match in the authorization policy.
          </Prose>
          <KV
            items={[
              [
                'Enable at',
                <>
                  The join point&rsquo;s <strong>Advanced Settings</strong> —
                  Enable Machine Authentication, Enable Machine Access
                  Restrictions, and an <strong>Aging Time (hours)</strong> value
                </>,
              ],
              ['Match on', <M>Network Access:WasMachineAuthenticated</M>],
              ['Failure code', <><M>24423</M> — ISE could not confirm a previous successful machine authentication for the user</>],
            ]}
            labelWidth={76}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'Documented limitations',
                children: (
                  <Bullets
                    items={[
                      <>MAR cache synchronisation between nodes exists only from <strong>ISE 2.3</strong>; before that a user landing on a different PSN than the one that saw the machine authentication fails</>,
                      <>It breaks across media — there is no way to correlate a wireless MAC with the same laptop&rsquo;s wired MAC</>,
                      <>On resume from hibernate the endpoint often goes straight to user authentication with no machine authentication, so an aged-out cache fails the user</>,
                      <>The cache is lost when the ISE service restarts</>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Note label="Use the replacement" tone="good">
            Cisco&rsquo;s own documented alternatives are EAP-FAST EAP chaining,
            which sends the machine and user credentials in one exchange, and{' '}
            <strong>TEAP</strong> — described as the long-term best solution.
            Both make the cache unnecessary because both authentications happen
            in a single session.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- CAP ---------------- */}
      <Panel title="Certificate Authentication Profile" kicker="How a certificate becomes an identity" span={5}>
        <Stack gap={6}>
          <Prose>
            A CAP answers one question: given this client certificate, what is
            the principal, and where do I look it up? Built at {EXT} &gt;{' '}
            <strong>Certificate Authentication Profile</strong>, then referenced
            from an authentication rule or from the top of an identity source
            sequence.
          </Prose>
          <Table
            head={['Field', 'Options']}
            widths={['30%', '70%']}
            rows={[
              [
                'Identity Store',
                <>
                  The AD join point or LDAP store to resolve the derived
                  identity against — or blank / <em>Not Applicable</em> for
                  pure certificate checking, as in the Entra ID flow
                </>,
              ],
              [
                'Use Identity From',
                <>
                  A single certificate attribute —{' '}
                  <M>Subject - Common Name</M>,{' '}
                  <M>Subject Alternative Name</M>,{' '}
                  <M>Subject Alternative Name - Other Name</M>,{' '}
                  <M>- DNS</M>, <M>- Email</M>, <M>Subject - Serial Number</M> —
                  or <strong>Any Subject or Alternative Name Attributes in the
                  Certificate</strong>, which tries several and uses the AD UPN
                  to resolve. That last option is valid only when the identity
                  store is Active Directory
                </>,
              ],
              [
                'Binary comparison',
                <>
                  <strong>Never</strong> ·{' '}
                  <strong>Only to resolve identity ambiguity</strong> (compares
                  only when multiple matching accounts are found) ·{' '}
                  <strong>Always perform binary comparison</strong>
                </>,
              ],
            ]}
          />
          <Note label="What binary comparison is, and is not">
            ISE takes the certificate the client presented and compares it{' '}
            <strong>byte for byte</strong> against the certificate stored on the
            matching AD or LDAP account. It is not a signature check and it is
            not a revocation check — that is what the trusted store, OCSP and
            CRL are for. It proves only that this is the exact certificate
            provisioned to that account. It requires the certificate to be
            published to the account object, and it costs an extra directory
            fetch on every authentication, so <em>Always</em> has a real scale
            cost.
          </Note>
          <Code
            title="The three recipes worth memorising"
            code={`User EAP-TLS against AD
  Use Identity From  Subject Alternative Name - Other Name   (the UPN)
  Identity Store     the AD join point
  Binary comparison  Only to resolve identity ambiguity

Machine EAP-TLS against AD
  Use Identity From  Subject Alternative Name - DNS
  Identity Store     the AD join point

MAC-in-SAN certificates (IoT)
  Use Identity From  Subject Alternative Name
  Identity Store     Internal Endpoints
  pairs with the built-in MAC_in_SAN condition`}
          />
        </Stack>
      </Panel>

      {/* ---------------- sequences ---------------- */}
      <Panel title="Identity Source Sequences" kicker="Ordered search, then the options" span={3} tone="quiet">
        <Stack gap={6}>
          <KV
            items={[
              [
                'Path',
                <M>Administration &gt; Identity Management &gt; Identity Source Sequences</M>,
              ],
              [
                'Certificate first',
                <>
                  Tick <strong>Certificate Based Authentication</strong> and
                  choose a CAP; it derives the principal before the search list
                  is walked
                </>,
              ],
              [
                'Search list',
                <>
                  Move stores from <strong>Available</strong> to{' '}
                  <strong>Selected</strong> and order them. ISE stops at the
                  first store that knows the subject
                </>,
              ],
              [
                'If a store is down',
                <>
                  Either <em>do not access other stores and set
                  AuthenticationStatus to ProcessError</em>, or{' '}
                  <em>treat as if the user was not found and proceed to the
                  next store</em>
                </>,
              ],
              [
                'Built-in',
                <>
                  <M>All_User_ID_Stores</M>, <M>Guest_Portal_Sequence</M>,{' '}
                  <M>Sponsor_Portal_Sequence</M>,{' '}
                  <M>MyDevices_Portal_Sequence</M>,{' '}
                  <M>Certificate_Request_Sequence</M>
                </>,
              ],
            ]}
            labelWidth={80}
          />
          <Note label="Long sequences are slow and ambiguous" tone="warn">
            Every store ahead of the right one is a query that has to fail
            first, and the same username can exist in two of them. Name the
            single store the rule actually needs; keep{' '}
            <M>All_User_ID_Stores</M> for the default rule and nothing else.
          </Note>
          <Prose>
            The diagnostic attributes <M>AD-Candidate-Identities</M>,{' '}
            <M>AD-Resolved-Identities</M> and <M>AD-Resolved-Providers</M> in
            the detailed authentication report show exactly which identities AD
            considered and which one it settled on.
          </Prose>
        </Stack>
      </Panel>
    </Sheet>
  )
}
