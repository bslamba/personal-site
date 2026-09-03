'use client'

// ============================================================
// Topic — APIs, Automation & Data Access
//
// Five programmable surfaces, each with a different job, a
// different port and a different node answering it. The
// selector is the reference: base URL, port, authentication,
// how it is enabled, a worked example, and what it is bad at.
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

interface Iface {
  id: string
  label: string
  name: string
  node: string
  gist: string
  facts: [React.ReactNode, React.ReactNode][]
  good: React.ReactNode[]
  bad: React.ReactNode[]
  code: { title: string; code: string }
  note?: { label: string; tone?: 'signal' | 'warn' | 'good'; body: React.ReactNode }
}

const IFACES: Iface[] = [
  {
    id: 'ers',
    label: 'ERS',
    name: 'ERS — External RESTful Services',
    node: 'PAN · read/write · secondaries read-only',
    gist:
      'The long-standing configuration REST API. CRUD against ISE objects — endpoints, identity groups, internal users, guest users, network devices — over HTTPS with Basic authentication. It is what most existing integrations, Catalyst Center included, already speak.',
    facts: [
      ['Base URL', <><M>https://&lt;PAN-FQDN&gt;:9060/</M></>],
      [
        'Ports',
        <>
          <M>TCP 9060</M> — the dedicated ERS port; <M>443</M> also serves ERS.{' '}
          <M>TCP 9062</M> for certificate-based ERS authentication, which is how
          Catalyst Center connects
        </>,
      ],
      ['Auth', <>HTTP Basic, using an account in the <strong>ERS Admin</strong> group</>],
      [
        'Enable at',
        <>
          <M>Administration &gt; System &gt; Settings &gt; ERS Settings</M> —{' '}
          <strong>Enable ERS for Read/Write</strong>
        </>,
      ],
      [
        'Distributed',
        <>
          Ensure <strong>Enable ERS for Read</strong> is selected on the
          secondary nodes. Writes go to the PAN
        </>,
      ],
      ['Concurrency', <>Default connection limit <strong>30</strong>, raisable to <strong>60</strong></>],
    ],
    good: [
      <>Bulk CRUD on configuration objects — the endpoint database, identity groups, network devices, guest users</>,
      <>Being already supported: Catalyst Center, the <M>ciscoisesdk</M> Python SDK and the <M>cisco.ise</M> Ansible collection all drive it</>,
      <>Certificate-based machine-to-machine authentication on <M>9062</M></>,
    ],
    bad: [
      <>Operational data. Sessions, counts and Live Logs are the MnT API&rsquo;s job, not ERS&rsquo;s</>,
      <>Recent features — new resource coverage lands in OpenAPI, not here</>,
      <>Anything high-concurrency; 30 connections by default is not a bulk-load channel</>,
    ],
    code: {
      title: 'The shape of an ERS call',
      code: `# 1. Enable it once, deployment-wide:
#    Administration > System > Settings > ERS Settings
#      [x] Enable ERS for Read/Write        (PAN)
#      [x] Enable ERS for Read              (secondaries)
#
# 2. Create an admin account in the ERS Admin group.
#
# 3. Call it over HTTPS with Basic auth:

curl -k -u ers-admin:'<password>' \\
     -H 'Accept: application/json' \\
     https://ise-pan.corp.example.com:9060/<resource-path>

# Resource paths belong to the release you are running --
# take them from the node's own API reference rather than
# from a blog post. Cisco publishes worked examples as
# "ISE ERS API Examples" on the Cisco Community.

# Catalyst Center authenticates with a certificate on
# TCP 9062 instead of Basic auth on 9060.`,
    },
    note: {
      label: 'Point it at the PAN',
      body: (
        <>
          Configuration writes are only accepted by the Primary PAN. Pointing an
          automation job at a PSN VIP because that is what the load balancer
          publishes is the single most common ERS mistake.
        </>
      ),
    },
  },

  {
    id: 'openapi',
    label: 'OpenAPI',
    name: 'OpenAPI',
    node: 'PAN · 443 · 9070 between nodes',
    gist:
      'The newer REST surface, and where Cisco has been putting new coverage since ISE 3.1 — repository, certificate and policy management arrived here rather than in ERS. Same transport story as ERS: HTTPS only.',
    facts: [
      ['Base URL', <><M>https://&lt;PAN-FQDN&gt;/</M> on <M>443</M></>],
      [
        'Ports',
        <>
          <M>TCP 443</M>. The ISE 3.5 documentation states that ERS and OpenAPI
          are HTTPS-only REST APIs operating over port 443. <M>TCP 9070</M>{' '}
          appears on the MnT node table for inter-node OpenAPI
        </>,
      ],
      ['Auth', <>An ISE administrator account over HTTPS, as for ERS</>],
      [
        'Enable at',
        <>
          The API settings area of the GUI, alongside ERS — ERS itself is at{' '}
          <M>Administration &gt; System &gt; Settings &gt; ERS Settings</M>
        </>,
      ],
      [
        'Front door',
        <>
          The <strong>ISE API Gateway Service</strong> — a process you can see in{' '}
          <M>show application status ise</M>
        </>,
      ],
      [
        'Since',
        <>
          ISE 3.1 for repository, certificate and policy management. ISE 3.5
          adds full IPv6 across ERS, OpenAPI, the API Gateway and the MnT REST
          API, plus HTTP/2 in the gateway
        </>,
      ],
    ],
    good: [
      <>Anything ERS never covered — repositories, certificates, policy objects</>,
      <>Being the surface Cisco is actually developing; assume new resources appear here first</>,
      <>Sitting behind the API Gateway, so it is one endpoint on one port</>,
    ],
    bad: [
      <>Parity with ERS. The two overlap unevenly, and which one holds a given resource depends on the release</>,
      <>Long-lived scripts across upgrades — check the on-box reference for your version rather than assuming stability</>,
      <>Operational and session data, which still belongs to MnT and pxGrid</>,
    ],
    code: {
      title: 'OpenAPI in practice',
      code: `# Same credential model as ERS, on the standard
# HTTPS port rather than a dedicated one:

curl -k -u <admin>:'<password>' \\
     -H 'Accept: application/json' \\
     https://ise-pan.corp.example.com/<resource-path>

# Where the resource paths come from:
#   - the on-box API reference for YOUR release
#   - DevNet:  https://cs.co/ise-api
#              https://cs.co/ise-devnet
#   - learning lab: https://cs.co/ise-lab
#
# What landed here rather than in ERS:
#   ISE 3.1  repository, certificate and policy management
#   ISE 3.5  full IPv6 across ERS / OpenAPI / gateway / MnT
#            HTTP/2 support in the API gateway`,
    },
    note: {
      label: 'Two APIs, one product',
      body: (
        <>
          ERS and OpenAPI are not versions of each other. They are separate
          surfaces that both configure ISE, and a real automation project
          usually ends up using both.
        </>
      ),
    },
  },

  {
    id: 'mnt',
    label: 'MnT API',
    name: 'MnT REST API',
    node: 'Monitoring node · read-only',
    gist:
      'Read-only operational data straight out of the Monitoring node: how many sessions are live, which licences are consumed, what is in the session database. Answerable from a browser, which makes it the fastest way to settle a licence-count argument.',
    facts: [
      ['Base URL', <><M>https://&lt;MnT-node&gt;/admin/API/mnt/</M></>],
      [
        'Ports',
        <>
          <M>443</M> for those URLs. <M>TCP 9443</M> is the MnT REST API port,
          inbound from the ISE API Gateway
        </>,
      ],
      ['Auth', <>ISE administrator credentials — the calls work from a logged-in browser</>],
      ['Node', <>The Monitoring persona. The Primary MnT is the one serving the GUI</>],
      [
        'Legacy names',
        <>
          The licence paths still carry the pre-3.x tier names —{' '}
          <M>Base</M>, <M>Intermediate</M>, <M>Premium</M>
        </>,
      ],
    ],
    good: [
      <>Licence consumption and active session counts without building a report</>,
      <>A monitoring probe — one HTTPS GET, one number back</>,
      <>Troubleshooting a licence-compliance alarm, where the GUI and the session DB disagree</>,
    ],
    bad: [
      <>Configuration. It reads, it does not write</>,
      <>Anything on a PSN or the PAN — these paths belong to the Monitoring node</>,
      <>Long-term reporting. For arbitrary history, use Data Connect</>,
    ],
    code: {
      title: 'The licensing and session URLs, verbatim',
      code: `https://<MnTNodeIP>/admin/API/mnt/Session/ActiveCount
https://<MnTNodeIP>/admin/API/mnt/Session/License/LicenseCountsFromSessionDB
https://<MnTNodeIP>/admin/API/mnt/License/Base
https://<MnTNodeIP>/admin/API/mnt/License/Intermediate
https://<MnTNodeIP>/admin/API/mnt/License/Premium
https://<MnTNodeIP>/admin/API/mnt/Session/ActiveList

# Paste them into a browser that already holds an ISE
# admin session, or call them with the admin credentials.
#
# Use these when the licensing dashboard and your own
# count disagree: ActiveCount and ActiveList come from
# the session database itself, not from the summary.`,
    },
  },

  {
    id: 'pxgrid',
    label: 'pxGrid',
    name: 'pxGrid 2.0 as an API surface',
    node: 'pxGrid persona · TCP 8910',
    gist:
      'Not a configuration API — a context bus. REST for control messages, queries and bulk downloads; WebSocket carrying STOMP frames for the push channel. From ISE 3.1 every pxGrid connection must be 2.0; the XMPP-based 1.0 is gone.',
    facts: [
      [
        'Control URL',
        <><M>https://&lt;pxgrid-node-FQDN&gt;:8910/pxgrid/control/&hellip;</M></>,
      ],
      [
        'Per-service',
        <>
          <strong>ServiceLookup</strong> returns a <M>restBaseUrl</M> such as{' '}
          <M>https://&lt;node&gt;:8910/pxgrid/mnt/sd</M> and a WebSocket{' '}
          <M>wss://&lt;node&gt;:8910/pxgrid/ise/pubsub</M>
        </>,
      ],
      ['Port', <><M>TCP 8910</M> for subscribers and for inter-node pxGrid</>],
      [
        'Auth',
        <>
          Client certificate (recommended), or username and password obtained
          via <strong>AccountCreate</strong>. Accounts land <strong>PENDING</strong>{' '}
          and must be approved to become <strong>ENABLED</strong>
        </>,
      ],
      [
        'Enable at',
        <>
          pxGrid persona at{' '}
          <M>Administration &gt; System &gt; Deployment &gt; node &gt; Edit</M>, then{' '}
          <M>Administration &gt; pxGrid Services &gt; Settings</M>
        </>,
      ],
    ],
    good: [
      <>Real-time push instead of polling — session, TrustSec, SXP, profiler, MDM and ANC topics</>,
      <>Pushing an <strong>ANC</strong> action back into ISE from a third-party product</>,
      <>Bulk download of the session directory when a subscriber first connects</>,
    ],
    bad: [
      <>Configuring anything. pxGrid publishes context; ERS and OpenAPI change configuration</>,
      <>Quick experiments — the certificate plumbing on both sides is the bulk of the work</>,
      <>Legacy clients. pxGrid 1.0 was removed in ISE 3.1 and its GUI and CLI references deleted with it</>,
    ],
    code: {
      title: 'The pxGrid client control flow',
      code: `1. Create an SSL context with the client certificate
   -or-  AccountCreate           (password auth)
2. AccountActivate      -> poll until state == ENABLED
3. ServiceLookup        -> discover the service, its node
                           and its restBaseUrl / wsUrl
4. AccessSecret         -> per-peer secret for that node
5. REST query the restBaseUrl,  and/or
   WebSocket SUBSCRIBE to the topic

Example URLs seen in a real ServiceLookup response:
  restBaseUrl  https://<node>:8910/pxgrid/mnt/sd
  wsUrl        wss://<node>:8910/pxgrid/ise/pubsub

Topics published by ISE:
  com.cisco.ise.session      com.cisco.ise.sxp
  com.cisco.ise.radius       com.cisco.ise.endpoint
  com.cisco.ise.trustsec     com.cisco.ise.mdm
  com.cisco.ise.config.anc   com.cisco.ise.system
  com.cisco.ise.pubsub`,
    },
    note: {
      label: 'Same CA both ways',
      body: (
        <>
          Sign ISE&rsquo;s pxGrid certificate and every client certificate with
          the same CA. Where a primary and a secondary pxGrid node serve the
          same subscriber, both must be signed by the same CA.
        </>
      ),
    },
  },

  {
    id: 'dataconnect',
    label: 'Data Connect',
    node: 'Secondary MnT · Oracle TCPS 2484',
    name: 'Data Connect',
    gist:
      'Direct ODBC or JDBC access to the ISE reporting database, introduced in ISE 3.2. When a report does not exist and no REST API returns the shape you need, this is the answer: arbitrary SQL against Cisco’s schema.',
    facts: [
      ['Transport', <>Oracle <strong>TCPS</strong> on <M>TCP 2484</M></>],
      [
        'Which node',
        <>
          The <strong>Secondary MnT</strong> by default. If the SMnT is removed,
          it moves to the <strong>Primary PAN</strong>
        </>,
      ],
      ['Username', <>Fixed: <M>dataconnect</M>. Service name: <M>cpm10</M></>],
      [
        'Password',
        <>
          12&ndash;30 characters with upper, lower, digit and special. Five
          failed logins cause a 24-hour lockout (<M>ORA-28000</M>). Expiry is
          1&ndash;3650 days, default <strong>90</strong>
        </>,
      ],
      [
        'Certificate',
        <>
          ISE 3.2 uses a self-signed Data Connect certificate; ISE 3.3 and later
          use the system certificate marked for <strong>Admin</strong> usage
        </>,
      ],
      [
        'Licence',
        <>
          At least <strong>Essentials</strong>. Disabled if the licence expires
          or the deployment goes out of compliance
        </>,
      ],
    ],
    good: [
      <>Custom reporting — joins, aggregates and time ranges the canned reports do not offer</>,
      <>Feeding a data warehouse or a BI tool without scraping the GUI</>,
      <>Volumes that would be absurd to page through a REST API</>,
    ],
    bad: [
      <>Writing anything. It is a read path into the reporting database</>,
      <>Schema stability — the shape is Cisco&rsquo;s, and it belongs to the release you are on</>,
      <>Deployments below Essentials, or any deployment out of compliance</>,
    ],
    code: {
      title: 'Connection parameters',
      code: `Host .......... <Secondary MnT FQDN>
                (Primary PAN if there is no SMnT)
Port .......... 2484
Protocol ...... Oracle TCPS
Service name .. cpm10
Username ...... dataconnect          (fixed)
Password ...... 12-30 chars, upper + lower
                + digit + special

Certificate
  ISE 3.2   self-signed Data Connect certificate
  ISE 3.3+  the system certificate with Admin usage

Guard rails
  5 failed logins -> 24-hour lockout (ORA-28000)
  password expiry 1-3650 days, default 90
  requires at least an Essentials licence`,
    },
    note: {
      label: 'Rotate the password on a calendar',
      tone: 'warn',
      body: (
        <>
          The default 90-day expiry will silently break every scheduled extract.
          Set the expiry deliberately and rotate on a schedule you control, not
          on the one the default hands you.
        </>
      ),
    },
  },
]

export default function ApiSheet() {
  const [ifaceId, setIfaceId] = useState(IFACES[0].id)
  const iface = IFACES.find(i => i.id === ifaceId) ?? IFACES[0]

  return (
    <Sheet>
      {/* ---------------- the surfaces ---------------- */}
      <Panel
        title="Five programmable surfaces"
        kicker="Different jobs, different nodes"
        span={5}
        tone="signal"
      >
        <Table
          head={['Interface', 'What it is for', 'Answers on', 'Port']}
          widths={['17%', '45%', '20%', '18%']}
          rows={[
            [
              'ERS',
              'External RESTful Services — CRUD on configuration objects: endpoints, identity groups, internal and guest users, network devices',
              'PAN (writes); secondaries read-only',
              <><M>9060</M> · <M>443</M> · <M>9062</M> cert</>,
            ],
            [
              'OpenAPI',
              'The newer configuration REST surface — repository, certificate and policy management from ISE 3.1 onwards',
              'PAN, behind the API Gateway',
              <><M>443</M> · <M>9070</M> inter-node</>,
            ],
            [
              'MnT REST API',
              'Read-only operational data — active session count, active session list, licence counts from the session database',
              'Monitoring node',
              <><M>443</M> · <M>9443</M> from the gateway</>,
            ],
            [
              'pxGrid 2.0',
              'The context bus. REST for control, query and bulk download; WebSocket + STOMP for push. ANC actions come back in',
              'pxGrid persona nodes',
              <><M>8910</M></>,
            ],
            [
              'Data Connect',
              'Direct ODBC / JDBC access to the reporting database for arbitrary SQL. ISE 3.2 and later',
              'Secondary MnT, else Primary PAN',
              <><M>2484</M> TCPS</>,
            ],
          ]}
        />
      </Panel>

      {/* ---------------- enabling ---------------- */}
      <Panel title="Switching them on" kicker="Before any of it answers" span={3}>
        <Stack gap={6}>
          <Steps
            items={[
              <><strong>ERS</strong> — <M>Administration &gt; System &gt; Settings &gt; ERS Settings</M>: <strong>Enable ERS for Read/Write</strong> on the PAN, <strong>Enable ERS for Read</strong> on secondaries. Then create an account in the <strong>ERS Admin</strong> group.</>,
              <><strong>pxGrid</strong> — enable the persona at <M>Administration &gt; System &gt; Deployment &gt; node &gt; Edit</M>, then set the approval options at <M>Administration &gt; pxGrid Services &gt; Settings</M>.</>,
              <>Approve each client at <M>pxGrid Services &gt; Client Management &gt; Clients</M> — PENDING becomes ENABLED.</>,
              <><strong>Data Connect</strong> — set the <M>dataconnect</M> password and enable it; it listens on the Secondary MnT.</>,
            ]}
          />
          <Note label="FQDN, not IP">
            All of this is TLS and every client validates a name. Use FQDNs, and
            make sure the ISE certificate carries them as SAN entries — the
            load-balancer VIP included.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- limits ---------------- */}
      <Panel title="The practical limits" kicker="What bites in production" span={4} tone="quiet">
        <Stack gap={6}>
          <Split
            cols={1}
            parts={[
              {
                title: 'Which node answers what',
                children: (
                  <Bullets
                    items={[
                      <>Configuration writes — <strong>Primary PAN only</strong>. ERS on a secondary is read-only</>,
                      <>Session and licence counts — the <strong>Monitoring</strong> node</>,
                      <>Context topics — a node with the <strong>pxGrid</strong> persona</>,
                      <>Data Connect — the <strong>Secondary MnT</strong>, or the Primary PAN if there is no SMnT</>,
                      <>Never aim an automation job at a PSN VIP simply because that is the name the load balancer publishes</>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'Ceilings and caveats',
                children: (
                  <Bullets
                    items={[
                      <>ERS default connection limit <strong>30</strong>, raisable to <strong>60</strong>. Rate-limit your own client</>,
                      <>ERS and OpenAPI are <strong>HTTPS-only</strong> and both operate over <M>443</M>; <M>9060</M> and <M>9070</M> are the dedicated ports</>,
                      <>ERS is the older surface — new resource coverage has been landing in OpenAPI since ISE 3.1</>,
                      <>pxGrid 1.0 was removed in ISE 3.1; all connections must be pxGrid 2.0</>,
                      <>Data Connect needs at least an Essentials licence and stops if the deployment falls out of compliance</>,
                    ]}
                  />
                ),
              },
            ]}
          />
        </Stack>
      </Panel>

      {/* ---------------- THE INTERFACE EXPLORER ---------------- */}
      <Panel
        title="Interface explorer"
        span={12}
        tone="ink"
        right={
          <span className="normal-case tracking-normal">
            Base URL, port, authentication, and what it is bad at
          </span>
        }
      >
        <Stack gap={8}>
          <div className="flex items-center justify-between gap-4">
            <Selector
              options={IFACES.map(i => ({ id: i.id, label: i.label, hint: i.gist }))}
              value={ifaceId}
              onChange={setIfaceId}
            />
            <Pill tone="neutral">{iface.node}</Pill>
          </div>

          <div className="border-t border-ink-200 pt-2">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <h4
                  className="text-[12px] font-bold tracking-tight text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {iface.name}
                </h4>
                <div className="mt-1">
                  <Prose>{iface.gist}</Prose>
                </div>
                <div className="mt-2">
                  <Split
                    cols={1}
                    parts={[
                      { title: 'Good at', children: <Bullets items={iface.good} /> },
                      { title: 'Bad at', children: <Bullets items={iface.bad} /> },
                    ]}
                  />
                </div>
              </div>

              <div className="col-span-4">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  URL, ports and authentication
                </div>
                <KV items={iface.facts} labelWidth={72} />
                {iface.note && (
                  <div className="mt-2">
                    <Note label={iface.note.label} tone={iface.note.tone}>
                      {iface.note.body}
                    </Note>
                  </div>
                )}
              </div>

              <div className="col-span-4">
                <div
                  className="mb-1 border-b border-ink-300 pb-[2px] text-[9px] font-bold uppercase tracking-[0.11em] text-ink-950"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Worked example
                </div>
                <Code title={iface.code.title} code={iface.code.code} />
              </div>
            </div>
          </div>
        </Stack>
      </Panel>

      {/* ---------------- MnT URLs ---------------- */}
      <Panel title="The six MnT URLs worth memorising" kicker="Licensing and sessions" span={4}>
        <Stack gap={6}>
          <Prose>
            HTTPS calls made directly from a browser that already holds an ISE
            admin session. The fastest way to find out how many licences a
            deployment is actually consuming.
          </Prose>
          <Code
            title="https://<MnTNodeIP>/admin/API/mnt/…"
            code={`Session/ActiveCount
Session/ActiveList
Session/License/LicenseCountsFromSessionDB
License/Base
License/Intermediate
License/Premium`}
          />
          <Note label="Legacy tier names">
            The licence paths still say <M>Base</M>, <M>Intermediate</M> and{' '}
            <M>Premium</M> — the pre-3.x names. Today&rsquo;s tiers are
            Essentials, Advantage and Premier, and the mapping is not
            one-to-one, so read the counts as session-database facts rather than
            as a licence-compliance verdict.
          </Note>
        </Stack>
      </Panel>

      {/* ---------------- SDKs ---------------- */}
      <Panel title="SDKs, Ansible and where the docs live" span={4} tone="quiet">
        <Stack gap={6}>
          <Split
            cols={1}
            parts={[
              {
                title: 'Drive it from code',
                children: (
                  <Bullets
                    items={[
                      <><M>ciscoisesdk</M> — the official Python SDK on PyPI, from <M>github.com/CiscoISE</M></>,
                      <><M>cisco.ise</M> — the official Ansible collection on Ansible Galaxy, docs at <M>ciscoise.github.io/ansible-ise</M></>,
                      <><strong>ISE Postman Collections</strong> — published on Cisco Code Exchange</>,
                      <>Community example sets: <strong>ISE ERS API Examples</strong> and <strong>ISE Monitoring API Examples</strong></>,
                    ]}
                  />
                ),
              },
            ]}
          />
          <Split
            cols={1}
            parts={[
              {
                title: 'Cisco short links',
                children: (
                  <KV
                    items={[
                      ['REST APIs', <M>cs.co/ise-api</M>],
                      ['DevNet hub', <M>cs.co/ise-devnet</M>],
                      ['Learning lab', <M>cs.co/ise-lab</M>],
                      ['Automation videos', <M>cs.co/ise-automation</M>],
                    ]}
                    labelWidth={82}
                  />
                ),
              },
            ]}
          />
          <Prose>
            There is a permanently available <strong>ISE Sandbox</strong> on
            DevNet, and an <strong>ISE APIs, Ansible and Automation</strong>{' '}
            learning module. Test destructive calls there, not against a
            production PAN.
          </Prose>
        </Stack>
      </Panel>

      {/* ---------------- choosing ---------------- */}
      <Panel title="Choosing the right surface" kicker="Decision table" span={4}>
        <Stack gap={6}>
          <Table
            head={['You want to…', 'Use']}
            widths={['58%', '42%']}
            rows={[
              ['Create, update or delete a configuration object', <>ERS, or OpenAPI where it has the resource</>],
              ['Manage repositories, certificates or policy objects', <>OpenAPI (ISE 3.1+)</>],
              ['Know how many sessions or licences are live right now', <>MnT REST API</>],
              ['React to a session appearing, changing or ending', <>pxGrid — subscribe, do not poll</>],
              ['Quarantine an endpoint from another product', <>pxGrid ANC</>],
              ['Run an arbitrary query over months of history', <>Data Connect</>],
              ['Enrich ISE with external endpoint attributes', <>pxGrid Direct — ISE pulls from your REST API</>],
            ]}
          />
          <Note label="Do not poll what you can subscribe to">
            The commonest ISE automation failure is a script polling ERS or the
            MnT API every few seconds for something pxGrid would have pushed.
            With an ERS connection limit of 30, a handful of eager pollers is
            enough to starve the integration that actually matters.
          </Note>
        </Stack>
      </Panel>
    </Sheet>
  )
}
