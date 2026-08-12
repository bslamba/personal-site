'use client'

// ============================================================
// app/page.tsx
// Editorial homepage. All content lives in the DATA block below —
// edit there, never in the layout underneath.
// ============================================================

import { useEffect } from 'react'
import Image from 'next/image'
import {
  ArrowUpRight, Download, MapPin, Mail,
  ShieldCheck, Network, Globe, Cloud,
} from 'lucide-react'

// Lucide 1.0 dropped all brand icons, so we draw LinkedIn ourselves.
function LinkedinIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  )
}

// ============================================================
// 1. DATA
// ============================================================

const PROFILE = {
  name: 'Bhawneet Singh Lamba',
  role: 'Infrastructure & Cloud Security Consultant',
  role2: 'Application Security · Network Architecture',
  location: 'Whitefield, Bangalore, India',
  email: 'bhawneetlamba@outlook.com',
  linkedin: 'https://www.linkedin.com/in/bhawneet-singh-lamba-92632064/',
  whatsapp: 'https://wa.me/918447732553',
  bio: [
    'Thirteen years spent on the parts of an enterprise that decide who gets ' +
    'in — the switch port on the office floor, the identity boundary in the ' +
    'cloud, and the request arriving at a public-facing application.',
    'Those three used to be separate jobs. They are not any more. A laptop ' +
    'authenticates at the access layer, reaches a workload in Azure, and calls ' +
    'an API sitting behind a WAF, and the attacker only needs one of those ' +
    'three to have been treated as somebody else’s problem.',
    'So I work across all of them: Network Access Control at enterprise scale, ' +
    'cloud security and identity design on Azure and AWS, and Layer 7 protection ' +
    'through F5, AWS and Azure WAF. Architecture when there is time, and ' +
    'incident response when there is not.',
  ],
}

// The three pillars, shown as cards under the opening statement.
const PILLARS = [
  {
    icon: ShieldCheck,
    kicker: 'Infrastructure',
    title: 'Network & access security',
    body:
      'Who and what is allowed onto the network, enforced at the port. NAC ' +
      'architecture, 802.1X, device trust and segmentation across estates of ' +
      'tens of thousands of endpoints.',
    tags: ['Cisco ISE', 'Aruba ClearPass', '802.1X', 'Segmentation'],
  },
  {
    icon: Cloud,
    kicker: 'Cloud',
    title: 'Cloud & cloud security',
    body:
      'Identity, network boundaries and governance in Azure and AWS. ' +
      'Conditional access, network security groups, private connectivity, ' +
      'and hybrid designs where the ground and the cloud have to agree.',
    tags: ['Microsoft Azure', 'Entra ID', 'AWS', 'Hybrid identity'],
  },
  {
    icon: Globe,
    kicker: 'Applications',
    title: 'Web application security',
    body:
      'Everything you publish to the internet, and the Layer 7 attacks aimed ' +
      'at it. WAF policy design, tuning against false positives, and rulesets ' +
      'that survive contact with a real application.',
    tags: ['F5 ASM', 'AWS WAF', 'Azure WAF', 'OWASP Top 10'],
  },
]

const STATS = [
  { value: '13+',    label: 'Years in the field' },
  { value: '05',     label: 'Enterprise employers' },
  { value: '18',     label: 'Client organisations' },
  { value: 'M.Tech', label: 'BITS Pilani, 2024' },
]

const EXPERIENCE = [
  {
    no: '01',
    role: 'Consultant',
    company: 'HCLTech',
    period: 'Mar 2025 — Present',
    current: true,
    lede: 'Keeping a live security estate answering, upgraded and audited.',
    points: [
      'L2/L3 triage on critical alerts — high CPU, policy service crashes — with deep-dive RADIUS and TACACS+ log analysis to isolate misconfiguration from supplicant error.',
      'Correlate security and infrastructure telemetry to kill recurring incidents at the root rather than the symptom.',
      'Phased, CAB-approved lifecycle changes to authorization policy sets, guest workflows and onboarding rules.',
      'Non-disruptive ISE 3.x cluster upgrades, plus full certificate lifecycle ownership including proactive EAP-TLS and WebAuth renewals.',
    ],
  },
  {
    no: '02',
    role: 'Professional Services Engineer',
    company: 'Cognizant',
    period: 'Aug 2022 — Feb 2025',
    lede: 'Designing and shipping security architecture across hybrid estates.',
    points: [
      'Designed and deployed security solutions spanning on-premises and cloud environments, covering identity, network boundary and application exposure.',
      'Led Cisco ISE and Aruba ClearPass deployments, establishing 802.1X authentication end to end.',
      'Implemented WAF across AWS, Azure and F5 to shield business-critical applications from Layer 7 attacks.',
      'Maintained security policy documentation alongside vulnerability and compliance reporting.',
    ],
  },
  {
    no: '03',
    role: 'Lead Administrator — Infra Security',
    company: 'Wipro',
    period: 'Oct 2021 — Aug 2022',
    lede: 'Running the team, and the knowledge that outlives the team.',
    points: [
      'Led a team of network security engineers to 100% SLA compliance on infrastructure availability.',
      'Operated NAC across Cisco ISE and Aruba ClearPass, supporting F5 LTM and ASM infrastructure.',
      'Took ownership of the Known Error Database, turning ad-hoc fixes into systematic, repeatable process.',
    ],
  },
  {
    no: '04',
    role: 'Network Engineer — Cisco TAC',
    company: 'Altran',
    period: 'Mar 2019 — Oct 2021',
    lede: 'The deep end: other people’s broken deployments, all day.',
    points: [
      'Architecture recommendations and configuration guidance across the Cisco ISE 2.x/3.x and ACS ecosystem.',
      'Greenfield ISE installations on physical appliances and virtualised environments, with RBAC, patching, licensing and disaster recovery.',
      'Advanced integrations via pxGrid with FMC, DNAC and StealthWatch; MDM posture sync through IBM MaaS360 and Microsoft Intune.',
      'Guest services end to end — sponsor portals, self-registration, SAML-based SSO, BYOD onboarding and endpoint profiling.',
    ],
  },
  {
    no: '05',
    role: 'Sr. Network Technician',
    company: 'Convergys',
    period: 'Oct 2013 — Mar 2019',
    lede: 'Where the fundamentals were learned.',
    points: [
      'Priority incident handling for high-impact infrastructure disruptions.',
      'Linux and Citrix platform troubleshooting, supporting Active Directory and Group Policy.',
    ],
  },
]

const EXPERTISE = [
  {
    icon: ShieldCheck,
    title: 'Infrastructure & access security',
    items: [
      'Cisco ISE 2.x / 3.x', 'Aruba ClearPass', 'Cisco ACS',
      'Network Access Control', 'Device posture', 'BYOD onboarding',
      'Guest access', 'Certificate lifecycle',
    ],
  },
  {
    icon: Cloud,
    title: 'Cloud & cloud security',
    items: [
      'Microsoft Azure', 'Entra ID', 'Conditional Access',
      'Network Security Groups', 'Azure Firewall', 'AWS',
      'Hybrid identity', 'Zero Trust design',
    ],
  },
  {
    icon: Globe,
    title: 'Application security',
    items: [
      'F5 ASM / Advanced WAF', 'AWS WAF', 'Azure WAF',
      'F5 LTM', 'OWASP Top 10', 'Layer 7 attack mitigation',
      'Policy tuning', 'TLS / certificates',
    ],
  },
  {
    icon: Network,
    title: 'Networking & protocols',
    items: [
      'RADIUS', 'TACACS+', '802.1X', 'MAB', 'WebAuth',
      'EAP-TLS', 'PEAP', 'TCP/UDP', 'DNS', 'DHCP', 'Routing & switching',
    ],
  },
]

const EDUCATION = [
  {
    degree: 'M.Tech',
    school: 'Birla Institute of Technology and Science, Pilani',
    period: 'Jan 2022 — Dec 2024',
    detail: 'Grade 8.02',
  },
  {
    degree: 'B.Tech',
    school: 'Quest Group of Institutions',
    period: '2009 — 2013',
    detail: 'Grade 74%',
  },
]

const CERTIFICATIONS = [
  { name: 'CCNA Routing and Switching', issuer: 'Cisco' },
  { name: 'ITIL Foundation', issuer: 'AXELOS Global Best Practice' },
  { name: 'Azure Essentials Professional', issuer: 'Microsoft · May 2026' },
]

const CLIENTS = [
  'Verizon Business', 'HCLTech', 'Fortrea', 'Wipro', 'FIFA', 'Cisco',
  'Xerox', 'Tesco', 'Upfield', 'Capgemini', 'Cognizant', 'Equitas',
  'KONE', 'Lipton', 'Post Office', 'National Gas', 'Siemens', 'Convergys',
]

// ============================================================
// 2. PAGE
// ============================================================

export default function HomePage() {

  // Fades sections in as they scroll into view.
  useEffect(() => {
    const items = document.querySelectorAll('.reveal')
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    )
    items.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: PROFILE.name,
            jobTitle: 'Infrastructure & Cloud Security Consultant',
            email: PROFILE.email,
            address: {
              '@type': 'PostalAddress',
              addressLocality: 'Bangalore',
              addressCountry: 'IN',
            },
            sameAs: [PROFILE.linkedin],
            knowsAbout: [
              'Infrastructure Security', 'Cloud Security', 'Application Security',
              'Network Access Control', 'Cisco ISE', 'Aruba ClearPass',
              'Microsoft Azure', 'Amazon Web Services', 'Zero Trust',
              'Web Application Firewall', 'F5 ASM', 'AWS WAF', 'Azure WAF',
              'RADIUS', 'TACACS+', '802.1x', 'EAP-TLS',
            ],
          }),
        }}
      />

      {/* ================= STATEMENT ================= */}
      <section className="relative overflow-hidden border-b border-ink-900/10 bg-paper">
        <div className="container-page py-24 sm:py-36">

          <div className="reveal flex items-center gap-4">
            <span className="h-px w-14 bg-signal-500" />
            <span className="label text-signal-500">Est. 2013 · Bangalore</span>
          </div>

          <h2 className="reveal heading mt-9 max-w-5xl text-[clamp(2.35rem,6.8vw,5.75rem)]">
            From the access port to the cloud edge — I secure{' '}
            <span className="text-signal-500">what lets people in</span>.
          </h2>

          <div className="reveal mt-16 grid gap-12 lg:grid-cols-[1.45fr_1fr] lg:gap-20">
            <div className="space-y-6">
              {PROFILE.bio.map((para, i) => (
                <p key={i} className="max-w-2xl text-lg leading-relaxed text-ink-600 sm:text-xl">
                  {para}
                </p>
              ))}
              <div className="flex flex-wrap gap-3 pt-4">
                <a href="#contact" className="btn-signal">
                  Start a conversation
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a href="/resume.pdf" download className="btn-ghost">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Résumé
                </a>
              </div>
            </div>

            <ul className="space-y-5 border-l-2 border-signal-500 pl-7 text-base">
              <li className="flex items-center gap-3 text-ink-600">
                <MapPin className="h-4 w-4 shrink-0 text-signal-500" aria-hidden="true" />
                {PROFILE.location}
              </li>
              <li>
                <a
                  href={`mailto:${PROFILE.email}`}
                  className="flex items-center gap-3 text-ink-600 transition-colors hover:text-signal-500"
                >
                  <Mail className="h-4 w-4 shrink-0 text-signal-500" aria-hidden="true" />
                  {PROFILE.email}
                </a>
              </li>
              <li>
                <a
                  href={PROFILE.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-ink-600 transition-colors hover:text-signal-500"
                >
                  <LinkedinIcon className="h-4 w-4 shrink-0 text-signal-500" aria-hidden="true" />
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>

        </div>
      </section>

      {/* ================= THREE PILLARS ================= */}
      <section className="border-b border-ink-900/10 bg-paper-dim py-20 sm:py-28">
        <div className="container-page">

          <div className="reveal mb-12 flex items-center gap-4">
            <span className="h-px w-14 bg-signal-500" />
            <span className="label text-signal-500">What I work on</span>
          </div>

          <div className="grid gap-px bg-ink-200 lg:grid-cols-3">
            {PILLARS.map(pillar => {
              const Icon = pillar.icon
              return (
                <div
                  key={pillar.title}
                  className="reveal group bg-paper p-9 transition-colors hover:bg-paper-dim sm:p-10"
                >
                  <Icon className="h-9 w-9 text-signal-500" aria-hidden="true" />

                  <span className="label mt-7 block text-ink-400">{pillar.kicker}</span>
                  <h3
                    className="mt-3 text-2xl leading-tight text-ink-950 sm:text-[1.7rem]"
                    style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, letterSpacing: '-0.02em' }}
                  >
                    {pillar.title}
                  </h3>

                  <p className="mt-5 text-base leading-relaxed text-ink-600">
                    {pillar.body}
                  </p>

                  <ul className="mt-7 flex flex-wrap gap-2">
                    {pillar.tags.map(tag => (
                      <li
                        key={tag}
                        className="border border-ink-200 px-3 py-1.5 text-xs text-ink-500 transition-colors group-hover:border-signal-500/40"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

        </div>
      </section>

      {/* ================= PROFILE / PORTRAIT ================= */}
      <section id="profile" className="scroll-mt-20 border-b border-ink-900/10 bg-paper py-24 sm:py-32">
        <div className="container-page">

          <div className="reveal mb-14 flex items-center gap-4">
            <span className="h-px w-14 bg-signal-500" />
            <span className="label text-signal-500">The profile</span>
          </div>

          <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-20">

            {/* --- Portrait. Fills its column; red frame offset behind. --- */}
            <div className="reveal relative">
              <span
                className="pointer-events-none absolute -bottom-5 -right-5 hidden h-full w-full border-2 border-signal-500 lg:block"
                aria-hidden="true"
              />
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-ink-950">
                <Image
                  src="/avatar.jpg"
                  alt={PROFILE.name}
                  fill
                  priority
                  sizes="(max-width: 1024px) 92vw, 45vw"
                  className="object-cover object-top"
                />
              </div>
            </div>

            {/* --- Name, role, numbers --- */}
            <div className="reveal">
              <p className="display-xl text-[clamp(3.25rem,9.5vw,8rem)]">
                Bhawneet
                <span className="block text-signal-500">Lamba</span>
              </p>

              <p
                className="mt-8 text-2xl leading-snug text-ink-800 sm:text-3xl"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '-0.02em' }}
              >
                {PROFILE.role}
                <span className="mt-1 block text-lg text-ink-400 sm:text-xl">{PROFILE.role2}</span>
              </p>

              <dl className="mt-12 grid grid-cols-2 gap-x-10 gap-y-10 border-t-2 border-ink-950 pt-10">
                {STATS.map(stat => (
                  <div key={stat.label}>
                    <dt className="label text-ink-400">{stat.label}</dt>
                    <dd className="display-xl mt-3 text-[clamp(2.25rem,5.5vw,4rem)] text-ink-950">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

          </div>
        </div>
      </section>

      {/* ================= EXPERIENCE ================= */}
      <section id="experience" className="scroll-mt-20 bg-paper py-24 sm:py-32">
        <div className="container-page">

          <div className="reveal flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink-950 pb-7">
            <div>
              <span className="label text-signal-500">Chapter one</span>
              <h2 className="heading mt-3 text-[clamp(2.5rem,8vw,6rem)]">Experience</h2>
            </div>
            <span className="label text-ink-400">2013 — Present</span>
          </div>

          <div className="mt-16 space-y-20">
            {EXPERIENCE.map(job => (
              <article
                key={job.no}
                className="reveal grid gap-8 border-b border-ink-200 pb-16 last:border-0 lg:grid-cols-[auto_1fr] lg:gap-14"
              >
                <div className="lg:w-48">
                  <span className="display-xl outline-type block text-[clamp(3.5rem,9vw,7rem)] leading-none">
                    {job.no}
                  </span>
                  <span className="label mt-4 block text-ink-400">{job.period}</span>
                  {job.current && (
                    <span className="label mt-3 inline-flex items-center gap-2 text-signal-500">
                      <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-signal-500" />
                      Current
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h3
                    className="text-3xl text-ink-950 sm:text-4xl"
                    style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, letterSpacing: '-0.02em' }}
                  >
                    {job.role}
                  </h3>
                  <p className="mt-2 text-xl font-medium text-signal-500">{job.company}</p>
                  <p className="mt-6 max-w-2xl text-xl italic leading-relaxed text-ink-500">
                    {job.lede}
                  </p>

                  <ul className="mt-8 grid gap-5 sm:grid-cols-2">
                    {job.points.map((point, i) => (
                      <li key={i} className="border-t border-ink-200 pt-4 text-base leading-relaxed text-ink-600">
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

        </div>
      </section>

      {/* ================= EXPERTISE ================= */}
      <section id="expertise" className="scroll-mt-20 bg-ink-950 py-24 text-paper sm:py-32">
        <div className="container-page">

          <div className="reveal border-b-2 border-paper pb-7">
            <span className="label text-signal-500">Chapter two</span>
            <h2 className="heading mt-3 text-[clamp(2.5rem,8vw,6rem)]">Expertise</h2>
          </div>

          <div className="mt-16 grid gap-px bg-ink-800 sm:grid-cols-2">
            {EXPERTISE.map(group => {
              const Icon = group.icon
              return (
                <div key={group.title} className="reveal bg-ink-950 p-10 transition-colors hover:bg-ink-900">
                  <Icon className="h-8 w-8 text-signal-500" aria-hidden="true" />
                  <h3
                    className="mt-7 text-2xl"
                    style={{ fontFamily: 'var(--font-heading)', fontWeight: 800 }}
                  >
                    {group.title}
                  </h3>
                  <ul className="mt-7 flex flex-wrap gap-2">
                    {group.items.map(item => (
                      <li
                        key={item}
                        className="border border-ink-700 px-3.5 py-2 text-sm text-ink-300 transition-colors hover:border-signal-500 hover:text-paper"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

        </div>
      </section>

      {/* ================= CREDENTIALS ================= */}
      <section className="border-b border-ink-900/10 bg-paper py-24 sm:py-32">
        <div className="container-page grid gap-16 lg:grid-cols-2 lg:gap-24">

          <div className="reveal">
            <span className="label text-signal-500">Academic</span>
            <h2 className="heading mt-3 text-[clamp(2.25rem,5vw,4rem)]">Education</h2>
            <div className="mt-10 space-y-8">
              {EDUCATION.map(item => (
                <div key={item.degree} className="grid grid-cols-[auto_1fr] gap-7 border-t border-ink-200 pt-7">
                  <span className="display-xl text-3xl text-signal-500">{item.degree}</span>
                  <div>
                    <p className="text-lg font-medium text-ink-900">{item.school}</p>
                    <p className="label mt-2 text-ink-400">{item.period} · {item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="reveal">
            <span className="label text-signal-500">Credentials</span>
            <h2 className="heading mt-3 text-[clamp(2.25rem,5vw,4rem)]">Certifications</h2>
            <div className="mt-10 space-y-8">
              {CERTIFICATIONS.map((cert, i) => (
                <div key={cert.name} className="grid grid-cols-[auto_1fr] gap-7 border-t border-ink-200 pt-7">
                  <span className="display-xl text-3xl text-signal-500">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="text-lg font-medium text-ink-900">{cert.name}</p>
                    <p className="label mt-2 text-ink-400">{cert.issuer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ================= CLIENTS ================= */}
      <section className="border-b border-ink-900/10 bg-paper-dim py-24 sm:py-28">
        <div className="container-page">

          <div className="reveal mb-12 flex items-center gap-4">
            <span className="h-px w-14 bg-signal-500" />
            <span className="label text-signal-500">Delivered for</span>
          </div>

          <ul className="reveal flex flex-wrap items-baseline gap-x-10 gap-y-5">
            {CLIENTS.map(client => (
              <li
                key={client}
                className="display-xl text-[clamp(1.5rem,3.4vw,2.75rem)] text-ink-300 transition-colors hover:text-signal-500"
              >
                {client}
              </li>
            ))}
          </ul>

        </div>
      </section>

      {/* ================= CONTACT ================= */}
      <section id="contact" className="scroll-mt-20 bg-signal-500 py-24 text-paper sm:py-36">
        <div className="container-page">

          <div className="reveal">
            <span className="label">Chapter three</span>
            <h2 className="heading mt-4 max-w-4xl text-[clamp(2.5rem,8vw,6.5rem)]">
              Let&apos;s talk about what you&apos;re exposing.
            </h2>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-signal-50 sm:text-xl">
              Available for consulting on infrastructure and network access
              security, cloud security and identity design on Azure and AWS,
              and web application firewall implementation and tuning.
            </p>

            <div className="mt-12 flex flex-wrap gap-4">
              <a
                href={`mailto:${PROFILE.email}`}
                className="inline-flex items-center gap-3 bg-ink-950 px-8 py-5 text-paper transition-transform hover:-translate-y-1"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                }}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {PROFILE.email}
              </a>
              <a
                href={PROFILE.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 border-2 border-paper px-8 py-5 text-paper transition-colors hover:bg-paper hover:text-signal-500"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  fontSize: '0.75rem',
                }}
              >
                <LinkedinIcon className="h-4 w-4" aria-hidden="true" />
                LinkedIn
              </a>
            </div>
          </div>

        </div>
      </section>
    </>
  )
}
