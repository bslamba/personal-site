---
title: "Cisco ISE Guest Access: Hotspot, Self-Registration and Sponsored Flows"
excerpt: "The three guest flows compared, how Central Web Authentication actually works, the role CoA plays, and the design decisions that determine whether guest access is a security control or a liability."
date: "2025-11-13"
tags: ["Cisco ISE", "Guest Access", "CWA", "CoA", "Network Access Control"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Hotspot** | No credentials. Accept an AUP and you're on. Lowest friction, least accountability. |
| **Self-Registration** | Guest registers themselves, gets credentials. Optional sponsor approval. Middle ground. |
| **Sponsored** | An employee creates the account in advance. Highest accountability, most admin effort. |
| **CWA** | Central Web Authentication. ISE hosts the portal; the NAD redirects to it. |
| **LWA** | Local Web Authentication. The NAD hosts the portal. Older, less capable. |
| **The flow** | MAB → ISE returns redirect ACL + URL → user authenticates on portal → **CoA** → full access. |
| **RADIUS NAC** | The setting that permits ISE to send CoA telling the NAD the user is now authenticated. Also used for posture. |
| **Redirect ACL** | Lives on the NAD, not ISE. Must permit DNS and the ISE portal, deny the rest. |
| **Portal cert** | Must be publicly trusted, or every guest sees a browser warning. |
| **Debug** | `guestaccess`, `guest-admin`, `portal` → `guest.log`; `runtime-AAA` → `prrt-server.log` |

---

Guest access is usually the first ISE feature deployed and the one given the least design thought. It's visible, it's demanded by the business, and it looks simple: put up a portal, let visitors on.

It's also the place where a NAC deployment most often creates the risk it was bought to remove. A guest network that's actually just an unmonitored path to the internal network is worse than no guest network, because everyone assumes it's controlled.

## The three flows

### Hotspot

No credentials at all. The guest connects, gets redirected to a portal, accepts an Acceptable Use Policy, and is granted access.

**Use when:** you want the lowest possible friction and the AUP acceptance is the point — a retail space, a public area, a lobby.

**The trade-off:** you have no idea who anyone is. You have a MAC address and a timestamp. If something happens from that network, your investigation ends at "a device was present".

Optionally an access code can be required, which gives you a weak shared secret but no individual identity.

### Self-Registration

The guest registers themselves on the portal — name, email, phone, company — and receives credentials, often by SMS or email.

**Use when:** you want some accountability without an employee having to do anything.

**The trade-off:** self-declared identity is only as true as the person filling the form. Delivering credentials by SMS to a phone number they provided at least proves they control that number, which is meaningfully better than nothing.

**Sponsor approval** can be layered on: the guest registers, an employee approves before access is granted. That closes most of the gap, at the cost of a wait.

### Sponsored

An employee creates the guest account in advance through the sponsor portal, and gives the credentials to the visitor.

**Use when:** accountability matters. Every guest account is traceable to the employee who created it.

**The trade-off:** administrative effort, and it fails at the moment of need — a visitor arrives unannounced and nobody with sponsor rights is available.

Sponsor groups control who may create accounts, for how long, and with what privileges. Worth configuring properly rather than granting everyone sponsor rights, which is the default drift.

## How Central Web Authentication works

CWA is the mechanism behind all three flows. Understanding the sequence makes troubleshooting straightforward.

**1. The guest connects.** No 802.1X supplicant is involved, so the NAD performs **MAB** — it sends the MAC address to ISE as a RADIUS request.

**2. ISE returns a redirect authorisation.** Two things come back: a **redirect URL** pointing at the ISE guest portal, and a **redirect ACL name**.

**3. The NAD applies the redirect ACL.** This is the part people get wrong. The ACL lives **on the network device**, not in ISE — ISE only names it. The ACL defines what traffic gets redirected and what passes.

**4. The guest opens a browser** and any HTTP request is redirected to the portal.

**5. The guest authenticates** — accepts the AUP, registers, or enters credentials.

**6. ISE sends CoA.** This is the pivot. The RADIUS NAC feature allows ISE to send a CoA-Request indicating the user is now authenticated and may access the network. The same mechanism is used for posture assessment, where ISE changes the user's profile based on the posture result.

**7. The NAD re-authorises the session** with the new profile, and the guest gets real access.

## The redirect ACL

This is the most common configuration error in guest deployments.

The ACL sits on the switch or WLC. On a switch, `permit` means "redirect this" and `deny` means "don't redirect, just forward". That inversion catches people out constantly.

```
ip access-list extended REDIRECT-GUEST
 deny   udp any any eq domain
 deny   ip any host 10.1.1.1
 permit tcp any any eq www
 permit tcp any any eq 443
```

Reading it correctly:

- **DNS is denied** — meaning not redirected, so it works. Without this the guest can't resolve the portal FQDN.
- **Traffic to ISE is denied** — not redirected, so the portal is reachable. Redirecting traffic to the portal *to* the portal creates a loop.
- **HTTP and HTTPS are permitted** — meaning redirected. This is what triggers the portal.

Get the first two lines wrong and the symptom is a portal that never loads, which sends people looking at ISE when the problem is on the switch.

On a WLC the syntax differs but the logic is identical.

## The certificate that guests will judge you on

The portal certificate must be **publicly trusted**. Not signed by your internal CA — publicly trusted.

Guests' devices have no reason to trust your internal PKI. If the portal presents an internally-signed certificate, every single guest gets a full-page browser security warning before they can connect.

Some will click through. Some will assume the network is compromised. All of them form an impression of your organisation in that moment.

Use a publicly-signed certificate with the portal FQDN in the Subject Alternative Name, and make sure that FQDN resolves on public DNS — guests frequently have public resolvers configured, and a name that only resolves internally will fail for them.

## Design decisions that actually matter

**Where does guest traffic go?**

The only correct answer is: straight out to the internet, on a separate VLAN, with no path to internal resources. Not "mostly separate". Not "separate except for the printer". Guest networks accumulate exceptions, and each one is a hole.

**Is it rate limited?**

Without a bandwidth cap, one guest streaming video degrades the corporate wireless. A per-user rate limit in the authorisation profile costs nothing to configure.

**How long do accounts live?**

Guest accounts should expire. The default lifetime should be measured in hours or days, not months. Expired accounts left enabled are a standing credential set nobody is watching.

**Is there logging worth having?**

You should be able to answer "who was on the guest network at 14:30 on Tuesday, and what did they connect to". That requires guest identity in ISE *and* flow or DNS logging on the guest path. Guest access without logging is deniability, not security.

**Is the AUP actually enforceable?**

If your legal team wrote it, it should be current. If it references a policy document from 2016, it isn't doing the job anyone thinks it is.

## Debugging guest access

Set these to debug under Operations → Troubleshoot → Debug Wizard:

- `guestaccess` → `guest.log`
- `guest-admin` → `guest.log`
- `guest-access-admin` → `guest.log`
- `portal` → `guest.log`
- `portal-session-manager` → `guest.log`
- `portal-web-action` → `guest.log`
- `runtime-AAA` → `prrt-server.log`
- `profiler` → `profiler.log`
- `saml` → `guest.log` — only if SAML SSO is in use

Tail it:

```
show logging application guest.log tail
```

Or filter:

```
show logging application guest.log | include portalwebaction
```

### The failures you'll actually see

**Portal never loads.** Redirect ACL. Check DNS is denied (not redirected) and traffic to ISE is denied. Then check the FQDN resolves from a guest device.

**Certificate warning.** Portal certificate isn't publicly trusted, or the FQDN doesn't match the SAN.

**Login succeeds, access doesn't change.** CoA. Check `aaa server radius dynamic-author` on the NAD, the port (3799 vs 1700), and that a firewall isn't blocking ISE → NAD.

**Works on one WLC, fails on another.** The redirect ACL name in the authorisation profile must exist, spelled identically, on every NAD. ISE only sends a name; if the NAD has no ACL by that name, nothing happens.

**Guest gets access but can reach internal resources.** The post-authentication authorisation profile is too permissive, or the guest VLAN isn't actually isolated. This is the one worth testing deliberately rather than assuming.

## A note on where this sits

Guest access is often treated as a convenience feature, separate from the security posture of the network. It isn't. It's an authenticated path onto your infrastructure, offered to people you have no relationship with.

Design it as though it will be used adversarially, because eventually it will be. Isolated, logged, rate-limited, expiring. Those four properties turn it from a liability into a control.
