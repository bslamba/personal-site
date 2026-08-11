---
title: "Cisco pxGrid Integrations: Connecting ISE to FMC, DNA Center and StealthWatch"
excerpt: "What pxGrid actually publishes, the certificate exchange that decides whether an integration works, and the step-by-step for the three most common integrations."
date: "2025-11-06"
tags: ["Cisco ISE", "pxGrid", "Firepower", "DNA Center", "StealthWatch", "Integration"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **What pxGrid is** | A publish/subscribe bus. ISE publishes session context; other products subscribe. |
| **The core value** | Other tools learn *which user and device* is behind an IP address. |
| **pxGrid 2.0** | WebSocket/STOMP based. Current version. Certificate exchange is automatic with DNAC. |
| **Certificates** | The whole game. Either ISE's internal CA signs the client, or both sides trust a common external CA. |
| **FMC integration** | ISE publishes identity → FMC writes user-aware firewall rules. Manual certificate exchange. |
| **DNA Center** | Certificate interchange happens **automatically**. Uses pxGrid 2.0. |
| **StealthWatch** | Export ISE CA certs → import on StealthWatch → generate single cert → import ISE SSH certs → enable ISE. |
| **Enable first** | Administration → pxGrid Services → Settings → *Automatically approve new certificate-based accounts* |
| **Max pxGrid nodes** | 4 |
| **Debug** | `pxgrid` → `pxgrid-server.log` (set to TRACE), `infrastructure` and `ers` → `ise-psc.log` |

---

ISE knows something no other security product on your network knows: which human being is behind a given IP address, on which device, authenticated how, and with what posture.

Your firewall sees `10.20.30.40`. Your flow collector sees `10.20.30.40`. Neither knows it's a contractor on an unmanaged laptop that failed posture check twenty minutes ago.

pxGrid is the mechanism that shares that context. It is what turns ISE from an access control product into the identity source for the rest of your security stack.

## What it actually is

pxGrid is a publish/subscribe bus. ISE is the publisher; other products subscribe to topics they care about.

The main topics:

**Session Directory** — the big one. Who is logged in, on what device, from which IP, with what authorisation and posture state.

**Identity Groups** — group membership, so consumers can act on role rather than username.

**TrustSec / SGT bindings** — which IP maps to which Security Group Tag.

**ANC (Adaptive Network Control)** — the *write* direction. This is how another product tells ISE to quarantine an endpoint.

That last one is the interesting one. Most integrations are ISE informing others. ANC lets a threat detection product act — a firewall detects malware, calls the ANC API, and ISE issues CoA to quarantine the host in seconds rather than in whatever time it takes a human to read an alert.

**pxGrid 2.0** is the current generation, built on WebSocket with STOMP messaging, replacing the older XMPP-based version 1.0. Everything modern uses 2.0.

## The certificate problem

Almost every failed pxGrid integration is a certificate problem. Understanding the model saves hours.

pxGrid uses **mutual certificate authentication**. ISE presents a certificate to the client; the client presents one back. Both must validate.

Two ways to arrange it:

**ISE internal CA** — ISE signs the client certificate. Simplest, and the right answer where the consumer supports it. You generate the certificate for the client from within ISE and hand it over.

**External CA** — both ISE and the client hold certificates signed by a common CA that each trusts. More work, but necessary in environments with a mandated PKI.

Whichever you use, both directions must validate. A certificate that's valid but whose issuing CA isn't in the other party's trust store fails exactly like an invalid certificate, and the error messages rarely make the distinction clear.

**Enable this before you start anything:**

**Administration → pxGrid Services → Settings** → tick **Automatically approve new certificate-based accounts**.

Without it, every client that connects sits in a pending state waiting for manual approval, and the client-side error looks like a connection failure rather than an approval queue.

## ISE to Firepower Management Center

The most common integration. It gives FMC user identity, so you can write firewall rules against users and groups instead of IP ranges.

### ISE side

**1. Enable pxGrid services** on the relevant node.

**2. Configure ISE to approve pxGrid accounts.**
Administration → pxGrid Services → Settings → check **Automatically approve new certificate-based accounts**.

**3. Generate a pxGrid certificate for FMC.**
Administration → pxGrid Services → Certificates. Generate a certificate for the FMC client, download it with its private key.

**4. Export the ISE MnT Admin certificate and the pxGrid CA certificate.**
Administration → pxGrid Services → Certificates. FMC needs both — the MnT admin certificate because it queries the monitoring node for session data, and the pxGrid CA to validate the connection.

### FMC side

**5. Add ISE to FMC.**
System → Integration → Identity Sources → Identity Services Engine. Enter the primary and secondary pxGrid node addresses, and upload the certificates from step 4.

Test the connection from within FMC before assuming it works — there's a test button, and it gives more useful errors than the logs do.

### With an external CA

The flow changes: instead of generating the client certificate in ISE, you issue both ISE's pxGrid certificate and FMC's client certificate from your own CA, and import that CA's root into both trust stores. The ISE steps become import operations rather than generate operations.

## ISE to DNA Center

Noticeably easier, because **certificate interchange is done automatically**.

DNAC and ISE negotiate the trust relationship themselves during integration, using **pxGrid 2.0**. You provide credentials and addresses; the certificate exchange happens without manual export and import.

That automation is genuinely a relief after doing the FMC dance, but it does mean when it fails you have less visibility into why. Check that ISE's pxGrid service is running and that DNAC can reach it on the required ports before assuming a deeper problem.

The integration gives DNA Center endpoint identity and lets it drive TrustSec policy — SGT assignment configured in DNAC, enforced through ISE.

## ISE to StealthWatch

StealthWatch (now Secure Network Analytics) uses ISE context to attach usernames to flow records. A flow between two IP addresses becomes a flow between two named users, which changes what an investigation looks like.

Five steps:

1. **Export ISE CA certificates**
2. **Import ISE CA certificates on StealthWatch**
3. **Generate a single certificate** for the integration
4. **Import ISE SSH certificates on StealthWatch**
5. **Enable ISE on StealthWatch**

The SSH certificate step is specific to this integration and easy to skip when following a generic pxGrid guide — StealthWatch uses it for a separate channel to ISE.

## Design considerations

**Maximum four pxGrid nodes.** In a medium deployment, pxGrid usually shares a node with PAN/MnT. In a large one it gets dedicated nodes.

**pxGrid is resource-hungry at scale.** Every session change is an event published to every subscriber. On a large estate with several consumers, that's a substantial and continuous message rate. If you're also running SXP for TrustSec, consider dedicating nodes rather than combining — the earlier design guidance about splitting pxGrid/SXP onto their own nodes in a medium deployment exists for this reason.

**Consumers depend on MnT.** Several integrations query the monitoring node for session history, not just the live pxGrid feed. An MnT outage degrades integrations in ways that aren't obvious from the pxGrid status page.

**Firewall the path deliberately.** pxGrid needs specific ports open between ISE and each consumer, and — like CoA — some of it is in the direction nobody wrote a rule for.

## Debugging

Set these under Operations → Troubleshoot → Debug Wizard. Note pxGrid wants **TRACE**, not debug:

- `pxgrid` → `pxgrid-server.log`
- `infrastructure` → `ise-psc.log`
- `ers` → `ise-psc.log`

Tail it live:

```
show logging application pxgrid/pxgrid-server.log tail
```

Find the right file if you're unsure of the exact name:

```
show logging application | include pxgrid
```

That returns the current log plus rotated files, which is useful when the problem happened yesterday.

**The failure pattern to expect:** client connects, TLS handshake completes, then the session fails or sits pending. That's the account approval setting, or a trust store gap on one side. Both look similar from the client, and the pxGrid log is where the distinction becomes clear.

## Why this matters more than it looks

The individual integrations are unglamorous certificate work. What they produce is not.

A firewall rule that says "contractors may not reach the finance subnet" instead of maintaining IP lists. A flow investigation that names people instead of addresses. A malware detection that quarantines the host automatically instead of raising a ticket.

That last one is the strongest argument for doing this work. The gap between detection and containment is where most breaches actually do their damage, and ANC over pxGrid closes it to seconds.
