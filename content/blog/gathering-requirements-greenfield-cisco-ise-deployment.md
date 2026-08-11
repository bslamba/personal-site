---
title: "Gathering Requirements for a Greenfield Cisco ISE Deployment"
excerpt: "The questions that determine whether an ISE project succeeds, organised into twenty phases — with a free 232-question discovery workbook to take into your first customer workshop."
date: "2026-06-25"
tags: ["Cisco ISE", "NAC", "Design", "Deployment", "Network Access Control", "Architecture"]
draft: false
---

## Cheat sheet

| Phase | What it settles |
|---|---|
| **Business and scope** | Why the project exists, what success means, who signs off enforcement |
| **Architecture and sizing** | Deployment model, node count, PSN placement, five-year headroom |
| **Network infrastructure** | Whether the hardware can do what the design assumes |
| **Identity sources** | What policy can actually be written |
| **Endpoints and profiling** | Which devices can authenticate and which need MAB |
| **Access methods** | Wired, wireless, VPN — and the phased enforcement plan |
| **Services** | Guest, BYOD, posture, TrustSec, device administration |
| **Foundations** | Certificates, integrations, HA, licensing |
| **Delivery** | Operations, migration sequencing, security review |

**The rule that matters:** do not begin architecture until business and scope is complete, and do not begin enforcement design until you understand the endpoint estate.

---

Most failed ISE deployments were not configured badly. They were scoped badly.

The configuration problems surface in a week and get fixed. The scoping problems surface in month six, when someone discovers the deployment model caps at eight nodes, or that four hundred devices have no supplicant and nobody knew, or that the branch firewall blocks Change of Authorization and posture will never work outside the data centre.

Every one of those is a question that could have been asked on day one.

<div class="callout">
<p><strong>Download the discovery workbook</strong></p>
<p>232 questions across 20 phases, each with the design decision it drives, an example answer showing the expected level of detail, a priority, and the customer team most likely to hold the answer. Includes a completion tracker that flags unanswered critical questions.</p>
<p style="margin-top:1rem">
<a class="btn-signal" href="/downloads/Cisco-ISE-Customer-Discovery-Questionnaire.xlsx" download>Download the questionnaire — XLSX</a>
</p>
</div>

## Why a structured questionnaire beats a conversation

A good architect can hold most of this in their head. The problem is not knowledge — it's that a discovery workshop is a conversation with six people who each know a different quarter of the answer, and the interesting gaps are the questions nobody thought to ask.

Three things a written question set gives you that a discussion does not:

**It surfaces who doesn't know.** When you ask "what happens at a branch if the WAN fails and ISE is unreachable" and the room goes quiet, you have found a design decision that nobody owns. That silence is more valuable than any answer.

**It creates a record.** Six months later, when someone says the requirement was different, the workbook says what was agreed and when.

**It sequences the work.** Questions asked in the wrong order produce answers that get invalidated. You cannot size a deployment before you know the scope, and you cannot design enforcement before you know what's on the network.

## The phases, and why they're in this order

### Business and scope, first and non-negotiable

Everything downstream is constrained by the answers here, and they're the questions technical people are most inclined to skip.

**What is the primary business driver?** An audit-driven project prioritises reporting and evidence. A security-driven project prioritises enforcement. A refresh project prioritises parity with the incumbent. These produce genuinely different designs.

**What happens if it doesn't complete on time?** This reveals whether the deadline is real. External audit re-test dates are real; internal aspirations usually aren't.

**Who is authorised to approve a policy that denies access to a user?** This is the question people find uncomfortable and it must be answered before enforcement begins. Enforcement is a business decision. Somebody has to own it by name, and that person should be in the room the day you move a floor to closed mode.

**How will success be measured, in numbers?** Without this the project cannot be closed, and ISE projects have a tendency to run indefinitely because nobody defined done.

### Architecture and sizing, with a five-year view

Sizing to today's endpoint count is the most common expensive mistake. The medium deployment model caps at eight nodes; discovering that in year two means a redeployment, not a licence change.

Ask for **peak concurrent endpoints**, not average, and not user count. Monday 09:00 when a campus badges in simultaneously is the number that matters.

Then ask for the **five-year growth projection**, including any planned IoT programme. IoT projects add endpoints in thousands and are rarely mentioned in a networking conversation.

Two questions in this phase are worth more than the rest combined:

**"What happens at a branch if the WAN fails and ISE is unreachable?"** If the honest answer is "everyone loses network access", you have a design problem rather than an operational one, and Critical Auth VLAN and Critical MAB need designing in rather than bolting on after the first outage.

**"Do network devices have more than one PSN in their RADIUS server group?"** If a switch knows one PSN, routine PSN maintenance becomes a site outage. Fixing this is a network change with its own change-control lead time, so it needs discovering early.

### Network infrastructure, before you promise anything

The design can only do what the hardware supports. Older access switches may not support IBNS 2.0, may not do inline SGT tagging, may not have a suitable code version available.

Ask for **models and software versions by site**, and specifically for anything **end of support**. A refresh dependency discovered during design is a schedule input; discovered during rollout it's a crisis.

The other question that repeatedly matters: **are there firewalls between the network devices and the PSNs?** Change of Authorization travels ISE → network device, which is the reverse of normal RADIUS. Every firewall rule anyone wrote was for the normal direction. This is why posture works perfectly in the data centre and fails at every branch.

### Identity sources determine what policy is possible

You cannot write a policy condition against something ISE cannot see.

Ask about **forests, domains and trusts**, about **which AD groups will drive authorisation**, and — increasingly relevant — about **Windows Server version**, because Windows Server 2025 disables EAP-MS-CHAPv2 and EAP-GTC password changes by default.

If certificate authentication is in scope, ask **how the certificate subject maps to an identity**. That single answer determines the certificate authentication profile and whether binary comparison is required.

### Endpoints and profiling: the discovery that takes longest

This is where monitor mode earns its weeks.

The questions that matter most:

**What non-user endpoints exist?** Printers, cameras, badge readers, building management, medical devices, OT. These cannot run a supplicant, they drive the entire MAB and profiling design, and the customer's list is always incomplete.

**Are there any devices that must never be blocked under any circumstances?** Life-safety systems, nurse call, fire panels. Get these named and documented before anything is enforced.

**Do Windows endpoints have Wired AutoConfig (DOT3SVC) running?** It isn't enabled by default on many builds, and its absence causes machines to fall to MAB and appear as unexpected unknown devices. Push it by GPO before monitor mode ends and you avoid an entire class of confusion.

**Are randomised MAC addresses in use?** They break MAB completely, and they're increasingly the default on phones and laptops.

### The service phases

Guest, BYOD, posture, TrustSec and device administration each get their own sheet, because each is independently scoped and independently deliverable.

A few questions from these that consistently expose gaps:

**Guest: where does guest traffic go, and can it reach any internal resource?** The only safe answer is straight to the internet on an isolated VLAN. Guest networks accumulate exceptions, and each exception is a hole.

**BYOD: will the provisioning network permit access to public app stores?** Android onboarding downloads its supplicant from Google Play. Lock the provisioning ACL to ISE and DNS only and Android fails, in a way that isn't obvious from any log.

**Posture: what access will a non-compliant endpoint receive?** It has to be able to reach whatever fixes it. Build a non-compliant state that can't reach the patch server and devices sit in remediation forever.

**Device administration: what is the fallback if ISE is unreachable?** Losing administrative access to every network device during an ISE outage is a serious and entirely avoidable position.

### Certificates, which cause more failures than anything else

A short sheet that prevents a long delay. Who owns issuance and what is the lead time. Which certificate ISE presents for EAP. Whether the issuing CA is trusted on non-domain-joined devices. How revocation is checked and whether endpoints can reach the endpoint through a pre-auth ACL. Whether the internal CA key has been exported.

Certificate requests routinely block ISE deployments for weeks because nobody asked about the PKI team's SLA in week one.

### Delivery: operations, sequencing, security review

The deployment succeeds or fails after go-live.

**Who will operate this, and do they have ISE experience?** Usually the answer is a network operations team with none. Training is frequently unbudgeted and is the cheapest insurance in the project.

**What is the rollback plan at each phase, and has it been tested?** Untested rollback is not a plan.

**What is the abort criterion, and who can call it?** Decided in advance, written down, and enforced by someone who isn't the person doing the work. The failure mode is always pressing on because you're nearly there.

## How to run the workshop

**Send the workbook in advance.** Not to be completed — to be read. It lets people identify which questions they can't answer and find out before the session.

**Book separate sessions per audience.** The network team cannot answer the identity questions and the business sponsor cannot answer either. Trying to do it in one session with everyone means most of the room is idle most of the time.

**Work in phase order and resist jumping ahead.** Technical people want to discuss VLAN assignment. Do not let the conversation get there before the endpoint estate is understood.

**Record "unknown" as an answer.** An honest unknown is progress. It becomes an action with an owner and a date. A guess recorded as fact becomes a design assumption that fails later.

**Watch the Critical Open count.** The workbook tracks unanswered critical questions per phase. Design should not proceed while that number is above zero for the phase you're in.

## What the workbook contains

Twenty phase sheets plus a read-me and a completion tracker. Every question carries four columns beyond the question itself:

**Why it matters** — the design decision the answer drives. Useful when a customer asks why you need to know.

**Example answer** — a realistic response showing the expected specificity. "Catalyst 9300 on 17.9.x at HQ, 2960X on 15.2 at branches" rather than "Cisco switches".

**Priority** — Critical blocks design, High blocks a workstream, Medium can follow.

**Owner** — which customer team most likely holds the answer, so you can route questions rather than asking everyone everything.

The tracker counts answered and outstanding questions per phase and flags critical gaps.

---

<div class="callout">
<p><strong>Get the workbook</strong></p>
<p>Free, no registration. Adapt it to your own engagements — the question set is a starting point, not a script.</p>
<p style="margin-top:1rem">
<a class="btn-signal" href="/downloads/Cisco-ISE-Customer-Discovery-Questionnaire.xlsx" download>Download the questionnaire — XLSX</a>
</p>
</div>

If you use it and find questions missing, I'd genuinely like to know. The gaps that matter are always the ones somebody hit in production.

---

**References**

- [Cisco ISE Device Administration Prescriptive Deployment Guide](https://community.cisco.com/t5/security-knowledge-base/cisco-ise-device-administration-prescriptive-deployment-guide/ta-p/3738365)
- [Cisco ISE Posture Prescriptive Deployment Guide](https://community.cisco.com/t5/security-documents/ise-posture-prescriptive-deployment-guide/ta-p/3680273)
- [Cisco ISE installation and configuration guides](https://www.cisco.com/c/en/us/support/security/identity-services-engine/products-installation-and-configuration-guides-list.html)
