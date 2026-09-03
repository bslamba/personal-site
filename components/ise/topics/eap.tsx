'use client'

// ============================================================
// Topic — EAP Methods & the 802.1X Exchange
//
// The interactive panel is the method explorer: pick an EAP
// method and you get its credential, its tunnel, the identity
// stores it can reach, its Allowed Protocols configuration and —
// for EAP-TLS, PEAP-MSCHAPv2 and TEAP — the real exchange as a
// ladder, in the order the packets actually appear.
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
  Ladder,
  Selector,
  type LadderStep,
} from '../sheet-kit'

interface Method {
  id: string
  label: string
  name: string
  tunnelled: boolean
  gist: string
  facts: [React.ReactNode, React.ReactNode][]
  stores: React.ReactNode
  ise: { title: string; code: string }
  note: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
  ladder?: { actors: string[]; steps: LadderStep[] }
  extra?: { title: string; code: string }
}

const ALLOWED = (
  <M>Policy &gt; Policy Elements &gt; Results &gt; Authentication &gt; Allowed Protocols</M>
)

const METHODS: Method[] = [
  {
    id: 'tls',
    label: 'EAP-TLS',
    name: 'EAP-TLS',
    tunnelled: false,
    gist:
      'Mutual certificate authentication, and the only common method with no password anywhere in it. There is no inner method because the TLS handshake itself is the authentication — both sides prove possession of a private key.',
    facts: [
      ['Credential', 'X.509 certificate on both sides. The client proves possession of its private key; ISE proves possession of the EAP certificate key'],
      ['Tunnel', <>None in the PEAP sense. The TLS session <em>is</em> the exchange, so the client certificate is visible on the wire in TLS 1.2</>],
      ['Identity from', <>A <strong>Certificate Authentication Profile</strong> — which certificate field becomes the principal, and whether to compare binary</>],
      ['Encrypts', 'The whole authentication'],
    ],
    stores: (
      <>
        Active Directory, LDAP and RSA (certificate retrieval), Internal Users
        or Internal Endpoints through a CAP as a presence check, and Entra ID
        from <strong>ISE 3.2</strong>. Not ODBC, not RADIUS token.
      </>
    ),
    ise: {
      title: 'What has to be true in ISE',
      code: `Allowed Protocols
  [x] EAP-TLS          (on in Default Network Access)
  [x] PEAP > inner EAP-TLS, if you want PEAP-TLS

Trusted Certificates store
  the issuing root CA, and every intermediate,
  trusted for client authentication

Certificate Authentication Profile
  Use Identity From    SAN - Other Name  (user UPN)
                       SAN - DNS         (machine)
  Identity Store       the AD join point
  Binary comparison    Only to resolve identity ambiguity

Authentication rule -> the CAP, or a sequence whose
  Certificate Based Authentication box names the CAP`,
    },
    note: {
      label: 'Where it fails, by code',
      body: (
        <>
          <M>12514</M> unknown CA in the client chain — the issuing CA is not
          in the trusted store. <M>12516</M> an expired certificate in the
          client chain. <M>12520</M> the client rejected the ISE certificate —
          that is the supplicant&rsquo;s trust configuration, not ISE&rsquo;s.{' '}
          <M>12508</M> is the generic handshake failure and <M>12815</M> shows
          the TLS alert the other side sent, which is usually the real answer.
        </>
      ),
    },
    ladder: {
      actors: ['Supplicant', 'Authenticator', 'ISE', 'AD / LDAP'],
      steps: [
        { from: 0, to: 1, label: 'EAPoL-Start' },
        { from: 1, to: 0, label: 'EAP-Request / Identity' },
        { from: 0, to: 2, label: 'EAP-Response / Identity', sub: 'RADIUS Access-Request [AVP: EAP-Response]' },
        { from: 2, to: 0, label: 'EAP-Request: EAP-TLS start', sub: 'Access-Challenge [AVP: EAP Proposal TLS]' },
        { from: 0, to: 2, label: 'TLS Client Hello', sub: 'Access-Request · ISE checks the proposal' },
        { from: 2, to: 0, label: 'TLS Server Hello + Server Certificate', sub: 'supplicant validates the server certificate' },
        { from: 0, to: 2, label: 'Client Certificate + Change Cipher Spec', sub: 'Access-Request · ISE validates the client certificate' },
        { from: 2, to: 3, label: 'Identity lookup', tone: 'muted', dashed: true, sub: 'principal derived by the CAP' },
        { from: 2, to: 0, label: 'EAP-Success', tone: 'signal', sub: 'RADIUS Access-Accept + authorization attributes' },
      ],
    },
  },

  {
    id: 'peap',
    label: 'PEAP-MSCHAPv2',
    name: 'PEAP with inner EAP-MSCHAPv2',
    tunnelled: true,
    gist:
      'A server-authenticated TLS tunnel with a password exchange inside it. Only ISE presents a certificate. It is the most deployed method precisely because it needs nothing on the endpoint but a domain password.',
    facts: [
      ['Credential', 'Username and password. MS-CHAPv2 is a challenge-response against the NT hash, so the password never crosses the tunnel'],
      ['Tunnel', 'Outer TLS, server certificate only. Everything from the inner identity onwards is encrypted'],
      ['Identity', <>Two of them: an <strong>outer</strong> identity in clear text and the real <strong>inner</strong> identity inside the tunnel</>],
      ['Encrypts', 'Only the inner MSCHAPv2 exchange'],
    ],
    stores: (
      <>
        Internal Users, Active Directory and ODBC — the three stores that can
        see a password hash. <strong>Not</strong> LDAP, RSA or a RADIUS token
        server; for those you need inner GTC instead.
      </>
    ),
    ise: {
      title: 'Allowed Protocols and the supplicant side',
      code: `Allowed Protocols
  [x] PEAP
      [x] EAP-MSCHAPv2       inner method
      [ ] EAP-GTC            use this for LDAP / OTP stores
      [ ] EAP-TLS            = PEAP-TLS
  Preferred EAP Protocol -> PEAP if the estate is mixed

Windows supplicant (the settings that matter)
  Authentication  Microsoft: Protected EAP (PEAP)
  [x] Verify the server's identity by validating the certificate
      Connect to these servers:  ise.example.com
      Trusted Root Certification Authorities: <your CA only>
  [ ] Do not prompt user to authorize new servers or CAs`,
    },
    note: {
      label: 'The whole security model is that one checkbox',
      tone: 'warn',
      body: (
        <>
          If the supplicant does not validate the server certificate, name the
          expected server and pin the CA, a rogue RADIUS server collects
          MSCHAPv2 challenge-response pairs from every user that walks past it.
          The tunnel protects the credential only from an attacker who is not
          terminating the tunnel. <M>12321</M> means the client rejected the
          ISE certificate; <M>12304</M> and <M>12305</M> are the normal inner
          challenge exchange.
        </>
      ),
    },
    ladder: {
      actors: ['Supplicant', 'Authenticator', 'ISE (AuthC server)'],
      steps: [
        { from: 0, to: 1, label: 'EAPoL-Start' },
        { from: 1, to: 0, label: 'EAP-Request / Identity' },
        { from: 0, to: 2, label: 'EAP-Response / Identity: mhudson', sub: 'Access-Request [AVP: EAP-Response: mhudson]' },
        { from: 2, to: 0, label: 'EAP-Request: PEAP start', sub: 'Access-Challenge [AVP: EAP Proposal PEAP]' },
        { from: 0, to: 2, label: 'TLS Client Hello' },
        { from: 2, to: 0, label: 'TLS Server Hello + Server Certificate', sub: 'supplicant validates the server certificate' },
        { from: 0, to: 2, label: 'TLS Change Cipher Spec', sub: 'tunnel up — everything below is inside it' },
        { from: 2, to: 0, label: 'Inner EAP-Request / Identity', tone: 'signal' },
        { from: 0, to: 2, label: 'Inner EAP-Response / Identity: mhudson', tone: 'signal', sub: 'ISE looks mhudson up in the identity store' },
        { from: 2, to: 0, label: 'MSCHAPv2 Challenge', tone: 'signal', sub: 'ISE to AD over MS-RPC; AD returns the challenge' },
        { from: 0, to: 2, label: 'MSCHAPv2 Response', tone: 'signal', sub: 'MS-RPC response; AD returns success' },
        { from: 2, to: 0, label: 'MSCHAPv2 Success', tone: 'signal' },
        { from: 2, to: 0, label: 'EAP-Success', sub: 'RADIUS Access-Accept [AVP: EAP-Response: mhudson]' },
      ],
    },
  },

  {
    id: 'teap',
    label: 'TEAP',
    name: 'TEAP — Tunnel EAP, RFC 7170',
    tunnelled: true,
    gist:
      'A tunnel that can run more than one inner method in the same session. That is the whole point: the machine and the user authenticate inside one exchange, so ISE knows for certain that this user is on this corporate machine.',
    facts: [
      ['Credential', 'Whatever the inner methods use — EAP-MSCHAPv2, EAP-TLS, or Basic Password Authentication'],
      ['Tunnel', 'Outer TLS with the ISE EAP certificate, then one or two inner EAP methods under its protection'],
      ['ISE support', <>From <strong>ISE 2.7</strong></>],
      ['Supplicant', <>Windows 10 build <strong>2004</strong> or later. Adapter properties &gt; Authentication &gt; <strong>Microsoft EAP-TEAP</strong>, then <em>User or computer authentication</em></>],
      ['Result attribute', <><M>Network Access:EapChainingResult</M> — the value to match for a chained success is <strong>User and machine both succeeded</strong></>],
    ],
    stores: (
      <>
        Whatever the inner method reaches: EAP-MSCHAPv2 against AD, Internal
        Users or ODBC; EAP-TLS against AD, LDAP or RSA, and against Entra ID
        from ISE 3.2 for the user only.
      </>
    ),
    ise: {
      title: 'Enabling TEAP and chaining',
      code: `Policy > Policy Elements > Results > Authentication >
  Allowed Protocols > Add New
    [x] TEAP
        [x] EAP Chaining
        [x] EAP-MSCHAPv2      inner
        [x] EAP-TLS           inner
  -- TEAP is NOT enabled in Default Network Access

Reference the new service from the policy set's
  Allowed Protocols column.

Authorization then matches
  Network Access:EapChainingResult
  EQUALS  User and machine both succeeded

Live Logs shows the chained identity as
  Administrator@example.local,host/Administrator`,
    },
    note: {
      label: 'What it replaced',
      tone: 'good',
      body: (
        <>
          EAP chaining previously meant EAP-FAST, which on Windows meant
          deploying the AnyConnect NAM module because the native supplicant did
          not support it. TEAP removes that dependency, and with it the need
          for <strong>Machine Access Restriction</strong> — there is no cache to
          age out, no wired-to-wireless correlation problem and no
          resume-from-hibernate hole, because both authentications are in the
          one session.
        </>
      ),
    },
    ladder: {
      actors: ['Supplicant', 'Authenticator', 'ISE', 'AD'],
      steps: [
        { from: 0, to: 1, label: 'EAPoL-Start' },
        { from: 1, to: 0, label: 'EAP-Request / Identity' },
        { from: 0, to: 2, label: 'EAP-Response / Identity', sub: 'anonymous outer identity' },
        { from: 2, to: 0, label: 'EAP-Request: TEAP start', sub: 'Access-Challenge · RFC 7170 outer tunnel' },
        { from: 0, to: 2, label: 'TLS Client Hello' },
        { from: 2, to: 0, label: 'TLS Server Hello + Server Certificate', sub: 'supplicant validates the ISE EAP certificate' },
        { from: 0, to: 2, label: 'Change Cipher Spec — tunnel up' },
        { from: 2, to: 0, label: 'Inner method 1: machine credential', tone: 'signal' },
        { from: 0, to: 2, label: 'Machine authenticates: host/PC1', tone: 'signal', sub: 'certificate or MSCHAPv2, per the inner method' },
        { from: 2, to: 0, label: 'Inner method 2: user credential', tone: 'signal' },
        { from: 0, to: 2, label: 'User authenticates: user@example.com', tone: 'signal' },
        { from: 2, to: 3, label: 'Groups and attributes for both', tone: 'muted', dashed: true },
        { from: 2, to: 0, label: 'EAP-Success', sub: 'Access-Accept, carrying EapChainingResult' },
      ],
    },
  },

  {
    id: 'ttls',
    label: 'EAP-TTLS',
    name: 'EAP-TTLS',
    tunnelled: true,
    gist:
      'The same shape as PEAP — server-authenticated tunnel, inner method — but the inner method may be a non-EAP one. Inner PAP is what makes TTLS the practical way to do password authentication against an LDAP directory.',
    facts: [
      ['Credential', 'Whatever the inner method uses; most often a password carried by inner PAP'],
      ['Tunnel', 'Outer TLS, server certificate only'],
      ['Inner methods', <>PAP, CHAP, MS-CHAP, MS-CHAPv2, EAP-MD5, EAP-MSCHAPv2, EAP-GTC</>],
      ['Support', <>ISE 2.x and later; on in the shipped <strong>Default Network Access</strong> service</>],
    ],
    stores: (
      <>
        Follows the inner method. Inner <strong>PAP</strong> reaches LDAP, ODBC,
        RSA and a RADIUS token server; inner <strong>MSCHAPv2</strong> reaches
        Active Directory and the internal database.
      </>
    ),
    ise: {
      title: 'Allowed Protocols',
      code: `Allowed Protocols
  [x] EAP-TTLS
      inner:  PAP / ASCII
              CHAP
              MS-CHAPv1  /  MS-CHAPv2
              EAP-MD5
              EAP-MSCHAPv2
              EAP-GTC

Common pairing
  EAP-TTLS + inner PAP  ->  LDAP identity store
  (the only clean way to do password 802.1X
   against a directory that is not AD)`,
    },
    note: {
      label: 'Where you meet it',
      body: (
        <>
          Non-Windows supplicants and eduroam. Inner PAP means the plaintext
          password reaches ISE inside the tunnel — acceptable, because the
          tunnel is the protection, but it makes server certificate validation
          on the supplicant every bit as critical as it is for PEAP.
        </>
      ),
    },
    extra: {
      title: 'Inner method decides the store',
      code: `inner PAP / ASCII   Internal · AD · LDAP · RADIUS token · RSA · ODBC
inner EAP-GTC       Internal · AD · LDAP · RADIUS token · RSA · ODBC
inner MS-CHAPv2     Internal · AD · ODBC
inner EAP-MD5       Internal · ODBC
inner CHAP          Internal · ODBC

Read it the other way round when you are designing:
pick the store first, and the inner method follows.`,
    },
  },

  {
    id: 'fast',
    label: 'EAP-FAST',
    name: 'EAP-FAST',
    tunnelled: true,
    gist:
      'Cisco-originated tunnelling that can build the tunnel from a PAC — a shared credential issued to the endpoint — instead of a server certificate. It carried EAP chaining before TEAP existed, and it is still what provisions TrustSec PACs.',
    facts: [
      ['Credential', 'Inner method credential, plus the PAC that protects the tunnel'],
      ['Tunnel', 'Outer TLS built from a PAC or from the ISE server certificate'],
      ['Inner methods', 'EAP-MSCHAPv2, EAP-GTC, EAP-TLS'],
      ['Chaining', <>Yes — the pre-TEAP mechanism, sending the machine and user credentials in one exchange</>],
      ['Still used by', <>TrustSec: PAC provisioning to a NAD is <strong>EAP-FAST Phase 0</strong></>],
    ],
    stores: <>Per inner method, exactly as for PEAP and TTLS.</>,
    ise: {
      title: 'The settings that matter',
      code: `Allowed Protocols > EAP-FAST
  [x] EAP-MSCHAPv2  /  EAP-GTC  /  EAP-TLS   inner
  [x] Allow Machine Authentication
  [x] Enable EAP Chaining
  [x] Enable Stateless Session Resume

PAC provisioning
  Anonymous     no server certificate needed,
                but no server authentication either
  Authenticated server certificate protects provisioning
  PAC Time To Live and proactive refresh percentage`,
    },
    note: {
      label: 'Superseded for endpoints',
      tone: 'warn',
      body: (
        <>
          Anonymous PAC provisioning gives you a tunnel with no server
          authentication, which is the same exposure as an unvalidated PEAP
          tunnel. On Windows, EAP-FAST chaining required the AnyConnect NAM
          module. TEAP does the same job natively — use EAP-FAST for new
          endpoint designs only if something in the estate genuinely cannot do
          TEAP.
        </>
      ),
    },
  },

  {
    id: 'md5',
    label: 'EAP-MD5',
    name: 'EAP-MD5',
    tunnelled: false,
    gist:
      'A bare MD5 challenge-response with no tunnel, no server authentication and no key material. It is in the default allowed protocols set, which is the only reason it is worth mentioning: go and turn it off.',
    facts: [
      ['Credential', 'Password, hashed into an MD5 challenge response'],
      ['Tunnel', 'None'],
      ['Server authentication', 'None — the supplicant has no way to know what it is talking to'],
      ['Key material', <>None, so it cannot key WPA2. Wireless is impossible, not merely unwise</>],
    ],
    stores: <>Internal Users and ODBC only. It cannot be used against Active Directory.</>,
    ise: {
      title: 'What to do about it',
      code: `Allowed Protocols > your service
  [ ] EAP-MD5     <- clear it
  [ ] LEAP        <- clear this too

Build your own allowed-protocols service rather than
editing Default Network Access, so the shipped service
stays as a reference point.

Process Host Lookup stays TICKED - that checkbox is
what permits MAB, and clearing it breaks every
MAB-authorised printer and phone in the estate.`,
    },
    note: {
      label: 'Dictionary attack, offline',
      tone: 'warn',
      body: (
        <>
          Anyone who can see the exchange gets a challenge and a response and
          can grind the password offline at their leisure. There is no
          mitigating configuration — the method has no tunnel to fix.
        </>
      ),
    },
  },
]

export default function EapSheet() {
  const [methodId, setMethodId] = useState(METHODS[0].id)
  const method = METHODS.find(m => m.id === methodId) ?? METHODS[0]

  return (
    <Sheet>
      {/* ---------------- what EAP is ---------------- */}
      <Panel title="EAP is a framework, not a protocol" kicker="And what follows from that" span={4}>
        <Stack gap={7}>
          <Prose>
            EAP defines a conversation — request, response, success, failure —
            and a way to negotiate which authentication method that conversation
            will use. It defines <strong>no encapsulation of its own</strong> and{' '}
            <strong>no frame types</strong>. Something else always has to carry
            it, which is why the same method behaves differently on a
            switchport, an SSID and a VPN headend.
          </Prose>
          <Table
            head={['Code', 'Packet', 'Sent by']}
            widths={['16%', '40%', '44%']}
            rows={[
              ['1', 'Request', 'The authenticator, on behalf of the server'],
              ['2', 'Response', 'The supplicant'],
              ['3', 'Success', 'The server, relayed by the authenticator'],
              ['4', 'Failure', 'The server, relayed by the authenticator'],
            ]}
          />
          <KV
            items={[
              ['Supplicant', 'The endpoint software that speaks EAP — dot3svc on Windows wired, wpa_supplicant, AnyConnect NAM'],
              ['Authenticator', 'The switch or WLC. It relays EAP; it never inspects the method'],
              ['Server', 'ISE. It chooses and terminates the method'],
              ['Negotiation', <>The server proposes a method; a supplicant that cannot do it replies with a NAK naming what it can do</>],
            ]}
            labelWidth={70}
          />
          <Note label="The consequence people miss">
            Because the authenticator only relays, adding an EAP method to ISE
            almost never requires a switch change. Conversely, no switch
            configuration will make a supplicant support a method it does not
            have.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- EAPOL ---------------- */}
      <Panel title="EAPOL — the LAN carrier" kicker="EAP over LAN, IEEE 802.1X" span={4} tone="signal">
        <Stack gap={7}>
          <Prose>
            On a wired or wireless LAN the carrier is <strong>EAPOL</strong>:
            an L2 encapsulation between supplicant and authenticator only. It
            never reaches ISE. From the authenticator onwards the same EAP
            payload travels inside RADIUS attributes, which is why every ladder
            on this page changes protocol at the switch.
          </Prose>
          <Table
            head={['EAPOL packet type', 'Type value', 'What it is for']}
            widths={['40%', '18%', '42%']}
            rows={[
              [
                'EAPOL-Start',
                <M key="s">0000 0001</M>,
                'The supplicant announcing itself, rather than waiting for the switch to ask',
              ],
              [
                'EAPOL-Logoff',
                <M key="l">0000 0010</M>,
                'The supplicant tearing its own session down — the port returns to unauthorised',
              ],
              [
                'EAPOL-Key',
                <M key="k">0000 0011</M>,
                'Key material delivery — the 4-way handshake on wireless, MACsec keying on wired',
              ],
              [
                'EAPOL-Encapsulated-ASF-Alert',
                <M key="a">0000 0100</M>,
                'Carries an ASF alert from an unauthenticated port, so a management alert can escape a closed port',
              ],
            ]}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'The other places EAP runs',
                children: (
                  <Bullets
                    items={[
                      <><strong>PPP</strong> — where EAP started, as an authentication option for dial-up and serial links</>,
                      <><strong>Wired 802.1X</strong> — EAPOL on the switchport, then RADIUS from switch to ISE</>,
                      <><strong>Wireless</strong> — EAPOL between client and AP or WLC, and EAPOL-Key carries the WPA2 handshake</>,
                      <><strong>VPN</strong> — EAP inside the remote-access tunnel negotiation, with the headend acting as authenticator</>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Note label="No EAPOL-Start is not a fault">
            Many supplicants never send one and simply wait for the
            switch&rsquo;s EAP-Request/Identity. An endpoint with no supplicant
            at all sends nothing, the switch times out after{' '}
            <M>tx-period</M> &times; retries, and only then does MAB get its
            turn — which is exactly why a closed-mode port with default timers
            feels broken to a printer.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- what ISE sees ---------------- */}
      <Panel title="What ISE sees for each kind of authentication" span={4} tone="quiet">
        <Stack gap={7}>
          <Table
            head={['Scenario', 'Service-Type', 'NAS-Port-Type']}
            widths={['42%', '30%', '28%']}
            rows={[
              ['MAB, wired', '10 (Call-Check)', '15 (Ethernet)'],
              ['Wired 802.1X', '2 (Framed)', '15 (Ethernet)'],
              ['Wireless 802.1X', '2 (Framed)', '19 (IEEE 802.11)'],
            ]}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'The two station IDs, and the two username forms',
                children: (
                  <Bullets
                    items={[
                      <><M>Calling-Station-ID</M> — the MAC of the device initiating the authentication: the laptop, phone or IoT endpoint</>,
                      <><M>Called-Station-ID</M> — the MAC of the network device the calling station is connected to, and on wireless it carries the SSID</>,
                      <><strong>SAM</strong> (sAMAccountName) — the short name, <M>mhudson</M></>,
                      <><strong>UPN</strong> (User Principal Name) — the long form, <M>mhudson@example.com</M> or <M>mhudson@child.example.com</M></>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Note label="Match the identity form to the store">
            An AD join point resolving a UPN and a certificate whose SAN carries
            a UPN line up naturally; a certificate carrying only a CN of{' '}
            <M>mhudson</M> does not, unless the CAP is told to use the common
            name. Where the two forms are mixed across a forest, use{' '}
            <strong>Identity Rewrite</strong> on the join point rather than
            writing a rule per domain.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- THE METHOD EXPLORER ---------------- */}
      <Panel
        title="EAP method explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Credential · tunnel · stores · Allowed Protocols · the exchange
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={METHODS.map(m => ({ id: m.id, label: m.label, hint: m.gist }))}
              value={methodId}
              onChange={setMethodId}
            />
            <Pill tone={method.tunnelled ? 'good' : 'warn'}>
              {method.tunnelled ? 'Tunnelled — outer TLS' : 'No tunnel'}
            </Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {method.name}
                </h4>
                <div className="mt-1">
                  <Prose>{method.gist}</Prose>
                </div>
                <div className="mt-2">
                  <KV items={method.facts} labelWidth={86} />
                </div>
                <div className="mt-2">
                  <div
                    className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Identity stores it works against
                  </div>
                  <Prose>{method.stores}</Prose>
                </div>
              </div>

              <div className="col-span-3">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Configuration in ISE
                </div>
                <Code title={method.ise.title} code={method.ise.code} />
                <div className="mt-2">
                  <Note label={method.note.label} tone={method.note.tone}>
                    {method.note.body}
                  </Note>
                </div>
              </div>

              <div className="col-span-5">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {method.ladder ? 'The exchange' : 'Reference'}
                </div>
                {method.ladder ? (
                  <Ladder
                    actors={method.ladder.actors}
                    steps={method.ladder.steps}
                    rowHeight={26}
                  />
                ) : method.extra ? (
                  <Code title={method.extra.title} code={method.extra.code} />
                ) : (
                  <Prose>
                    The exchange is the tunnel build followed by the inner
                    method — see EAP-TLS and PEAP for the two shapes.
                  </Prose>
                )}
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- comparison ---------------- */}
      <Panel title="EAP-TLS against PEAP-MSCHAPv2" kicker="The comparison that decides a design" span={4}>
        <Table
          head={['Step', 'EAP-TLS', 'PEAP-MSCHAPv2']}
          widths={['26%', '37%', '37%']}
          rows={[
            [
              'Identity exchange',
              'Client and server exchange identities',
              'Client and server exchange identities',
            ],
            [
              'TLS handshake',
              'Full handshake with mutual certificate exchange',
              'Outer handshake with only the server certificate',
            ],
            [
              'Inner authentication',
              'None — the TLS handshake is the mutual authentication',
              'Inner MSCHAPv2 username and password inside the tunnel',
            ],
            [
              'Certificates needed',
              'Client and server certificates',
              'Server certificate only',
            ],
            [
              'Encryption',
              'The entire authentication is encrypted',
              'Only the inner MSCHAPv2 exchange is encrypted',
            ],
          ]}
        />
        <div className="mt-2">
          <Note label="Choose on the endpoint, not on ISE">
            Both are trivial to enable in ISE. The cost of EAP-TLS is entirely
            in issuing, renewing and revoking a certificate on every endpoint —
            which is what BYOD onboarding and the internal CA exist to
            industrialise.
          </Note>
        </div>
      </Panel>

      {/* ---------------- timers ---------------- */}
      <Panel title="The timers that decide whether it fails" kicker="Supplicant · NAD · server" span={5}>
        <div className="grid grid-cols-2 gap-3">
          <Stack gap={6}>
            <Split
              cols={1}
              parts={[
                {
                  title: 'Supplicant side',
                  children: (
                    <KV
                      items={[
                        ['startPeriod', <>How long to wait before retrying an EAPOL-Start. Default <strong>30&nbsp;s</strong></>],
                        ['authPeriod', <>The maximum time the client waits for a response. Default <strong>30&nbsp;s</strong></>],
                        ['heldPeriod', <>How long the supplicant sulks after a failure before trying again</>],
                        ['maxStart', <>How many EAPOL-Starts it sends before giving up on 802.1X</>],
                      ]}
                      labelWidth={64}
                    />
                  ),
                },
              ]}
            />
            <Note label="Server side, and you cannot change it">
              ISE waits <strong>120 seconds</strong> for an Access-Request after
              it has sent an Access-Challenge for a session. That EAP session
              timer is <strong>not configurable</strong>. If the supplicant and
              the NAD between them take longer than that, the session is gone
              and the endpoint starts again from EAPOL-Start.
            </Note>
          </Stack>
          <Stack gap={6}>
            <Code
              title="NAD side — the three that matter"
              code={`! EAP-Request/Identity retransmission
dot1x timeout tx-period 30
dot1x max reauth-request 2

! EAP-Request retransmission to the supplicant
dot1x timeout supp-timeout 30
dot1x max-req 2

! RADIUS transport to ISE
radius-server timeout 5
radius-server retransmit 3
radius-server dead-criteria time 10 tries 3
radius-server deadtime 15`}
            />
            <Note label="tx-period is the MAB delay" tone="warn">
              A printer with no supplicant waits{' '}
              <M>tx-period</M> &times; (<M>max reauth-request</M> + 1) before
              the switch gives up on 802.1X and tries MAB. At the defaults that
              is a minute and a half of no network, long enough for the device
              to have given up on DHCP. Lowering tx-period is the standard fix.
            </Note>
          </Stack>
        </div>
      </Panel>

      {/* ---------------- allowed protocols ---------------- */}
      <Panel title="Allowed Protocols, and the codes to search for" span={3} tone="quiet">
        <Stack gap={6}>
          <KV
            items={[
              ['Path', ALLOWED],
              [
                'Shipped default',
                <>
                  <strong>Default Network Access</strong> — process host lookup,
                  PAP/ASCII, EAP-MD5, EAP-TLS, PEAP, EAP-FAST, EAP-TTLS
                </>,
              ],
              ['Not in it', <>TEAP. Enable it explicitly, together with <strong>EAP Chaining</strong></>],
              ['MAB switch', <><strong>Process Host Lookup</strong> — clearing it disables MAB deployment-wide</>],
              ['Per policy set', <>The allowed protocols service is chosen on the policy set row, so a wired set and a guest set can differ</>],
            ]}
            labelWidth={78}
          />
          <Table
            head={['Code', 'Meaning']}
            widths={['22%', '78%']}
            rows={[
              ['12508', 'EAP-TLS handshake failed'],
              ['12514', 'Unknown CA in the client certificate chain'],
              ['12516', 'Expired certificate in the client certificate chain'],
              ['12520', 'Client rejected the ISE local certificate (EAP-TLS)'],
              ['12321', 'Client rejected the ISE local certificate (PEAP)'],
              ['12153', 'Client rejected the ISE local certificate (EAP-FAST)'],
              ['12815', 'Extracted TLS alert message — read this one first'],
            ]}
          />
          <Note label="Prove the switch before blaming ISE">
            <M>debug dot1x all</M>, <M>debug radius</M>, and{' '}
            <M>debug epm all</M> for authorisation failures. Collect to the
            buffer, not the console: <M>no logging console</M>,{' '}
            <M>logging buffered 7</M>, then{' '}
            <M>logging buffered 10000000</M> — set the level first, because
            changing it resets the buffer size.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
