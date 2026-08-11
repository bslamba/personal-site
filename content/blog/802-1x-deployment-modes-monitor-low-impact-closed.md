---
title: "Deploying 802.1X Without Breaking the Network: Monitor, Low Impact and Closed Mode"
excerpt: "The three-phase rollout that keeps you employed. What each mode actually enforces, the switch configuration behind it, and how Critical ACL and Critical MAB stop a RADIUS outage becoming a site outage."
date: "2025-10-09"
tags: ["802.1X", "Cisco ISE", "MAB", "IBNS 2.0", "Network Access Control"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Monitor Mode** | `authentication open`. Everything is permitted regardless of result. You get visibility, zero enforcement. Always phase one. |
| **Low Impact Mode** | `authentication open` + a pre-auth ACL. Limited access before auth (DHCP, DNS, PXE), full access after. |
| **Closed Mode** | No `authentication open`. Nothing passes until authentication succeeds. Full enforcement. |
| **EAPOL-Start** | Supplicant announces itself and requests authentication. |
| **EAPOL-Logoff** | Supplicant terminates its session. |
| **EAPOL-Key** | Authenticator sends encrypted keys to the supplicant. |
| **MAB** | MAC Authentication Bypass. Fallback for printers, cameras, anything without a supplicant. |
| **Critical ACL** | What endpoints get when every RADIUS server is unreachable. |
| **Critical MAB** | Local authorisation for MAB endpoints during a RADIUS outage. |
| **Windows service** | Wired AutoConfig (DOT3SVC) — must be running or the PC will never do 802.1X. |
| **Key debugs** | `debug dot1x all`, `debug mab all`, `debug epm all` |

---

The fastest way to lose confidence in a NAC project is to enable 802.1X in enforcement mode on a production access switch and discover which of your endpoints don't have supplicants. The badge readers. The label printers. The building management controllers nobody has documented since 2014.

The three-phase approach exists to prevent exactly that. It is not caution for its own sake — it is how you discover your endpoint estate without an outage.

## Understanding the framework first

**EAP is a framework, not a protocol.** It doesn't define encapsulation and it doesn't define frame types. It defines a conversation shape that other things carry.

**EAPOL is what carries EAP over a LAN.** It encapsulates EAP messages in Ethernet frames between supplicant and authenticator, and adds its own message types:

| Packet type | Name | Purpose |
|---|---|---|
| `0000 0001` | EAPOL-Start | Sent to announce presence and request authentication |
| `0000 0010` | EAPOL-Logoff | Supplicant terminates its session with the authenticator |
| `0000 0011` | EAPOL-Key | Authenticator sends encrypted keys to the supplicant |
| `0000 0100` | EAPOL-Encapsulated-ASF-Alert | Alerts to an NMS about unauthorised ports and security events |

EAP isn't limited to LANs. It also runs over PPP, wireless (WPA2/WPA3), and VPN protocols like PPTP and L2TP. The framework is the same; only the transport changes.

Three roles in every exchange: the **supplicant** (the endpoint's 802.1X client), the **authenticator** (the switch or WLC), and the **authentication server** (ISE).

## Phase 1 — Monitor Mode

The single most important command:

```
interface GigabitEthernet1/0/10
 authentication open
```

`authentication open` means the port forwards traffic **regardless of the authentication result**. Authentication runs, results are logged, and nothing is enforced.

What this buys you:

- Every endpoint on the network appears in ISE with its MAC, and usually its profile
- You discover which devices have working supplicants and which don't
- You find the endpoints nobody documented
- Users notice nothing

Run it for weeks, not days. Long enough to catch the monthly contractor, the seasonal device, the laptop that comes out of a drawer at quarter end.

**What you are looking for in Live Logs:** MAB authentications that should have been 802.1X (a supplicant isn't configured), repeated failures from the same MAC (a certificate or credential problem), and endpoints appearing with `Unknown` profiles (your profiling needs work before enforcement).

Do not move to phase two while you still have unexplained MAB endpoints.

## Phase 2 — Low Impact Mode

Still `authentication open`, but now with a **pre-authentication ACL** applied to the port. Endpoints get restricted access before authenticating and full access after.

```
ip access-list extended PRE-AUTH
 permit udp any eq bootpc any eq bootps
 permit udp any any eq domain
 permit udp any any eq tftp
 deny   ip any any

interface GigabitEthernet1/0/10
 ip access-group PRE-AUTH in
 authentication open
```

The pre-auth ACL must permit whatever an endpoint needs *in order to* authenticate or boot:

- **DHCP** — obviously
- **DNS** — for certificate revocation checks and portal redirects
- **TFTP/PXE** — if machines network-boot, this is not optional
- **Your imaging and provisioning servers** — thin-image deployments break spectacularly without this

This phase is where the value is. You get real enforcement for authenticated endpoints while unknown devices still function in a limited way, so a missed device is degraded rather than dead.

## Phase 3 — Closed Mode

Remove `authentication open`. Now nothing passes until authentication succeeds.

```
interface GigabitEthernet1/0/10
 no authentication open
 authentication port-control auto
```

Full enforcement. An endpoint that fails authentication and has no fallback authorisation gets nothing.

Only go here when phase two has run clean for a sustained period and you have a documented answer for every device type on the network.

## The core switch configuration

Globally:

```
dot1x system-auth-control
```

Enables 802.1X on the device. Nothing happens without it.

Per interface:

```
interface GigabitEthernet1/0/10
 authentication port-control auto
 dot1x pae authenticator
 mab
```

**`authentication port-control auto`** — the port uses 802.1X port-based authentication. The three values matter:

- `auto` — authenticate, then authorise. What you want.
- `force-authorized` — always open. Effectively disabled.
- `force-unauthorized` — always closed. Useful for locking a port hard.

**`dot1x pae authenticator`** — sets the port's Port Access Entity role. `authenticator` means the switch authenticates others. `supplicant` means the switch authenticates *itself* to another device — used for switch-to-switch 802.1X, which is a genuinely different design.

**`mab`** — enables MAC Authentication Bypass as a fallback.

## Host modes

How many endpoints may a single port authorise?

| Mode | Behaviour |
|---|---|
| **single-host** | One MAC only. Most restrictive. |
| **multi-domain** | One data endpoint plus one voice endpoint. The standard for a desk with a phone. |
| **multi-auth** | Every MAC authenticates independently. The right answer behind unmanaged switches and hypervisors. |
| **multi-host** | First MAC authenticates, everything else rides along. Authorises the port, not the endpoint — weak, and rarely the right choice. |

`multi-host` is worth calling out because it looks convenient and is a security hole: one authenticated device opens the port for everything else on it.

## Voice VLAN

Phones need special handling. With `multi-domain`, the phone authenticates into the voice domain and the PC behind it into the data domain, independently.

```
interface GigabitEthernet1/0/10
 switchport access vlan 10
 switchport voice vlan 110
 authentication host-mode multi-domain
```

ISE must return the correct `device-traffic-class=voice` attribute for the phone, or it lands in the data VLAN and calls fail in a way that looks like a voice problem.

## Surviving a RADIUS outage

This is the part that separates a design that survives from one that makes the news internally.

**Critical ACL** — what an endpoint gets when *every* configured RADIUS server is unreachable. Without it, an ISE outage becomes a total network outage for every 802.1X port.

**Critical MAB** — local authorisation for MAB endpoints during a RADIUS failure, so printers and door controllers keep working.

```
interface GigabitEthernet1/0/10
 authentication event server dead action authorize vlan 100
 authentication event server dead action authorize voice
 authentication event server alive action reinitialize
```

The `alive action reinitialize` line matters as much as the dead action — it forces re-authentication once RADIUS returns, so endpoints don't sit in critical authorisation indefinitely.

Test this deliberately. Block RADIUS to a test switch and confirm the behaviour is what you designed. Discovering your critical ACL doesn't work during an actual outage is the worst possible time.

## IBNS 2.0 and C3PL

Identity-Based Networking Services 2.0 replaces the older fixed command set with **Cisco Common Classification Policy Language (C3PL)** — a class-map/policy-map structure that gives you conditional logic instead of a rigid sequence.

Practical gains:

- Genuinely concurrent 802.1X and MAB, instead of waiting for 802.1X to time out first
- Differentiated behaviour per failure type
- Service templates you define once and reuse
- **Intelligent Aging** — the inactivity timer is supplemented with ARP probes, using the IP device tracking table, to confirm an endpoint has genuinely gone rather than just gone quiet

That last one solves a real irritation: sessions torn down for a quiet-but-connected device, which then has to re-authenticate.

## Debugging the switch

Enable these three:

```
debug dot1x all
debug mab all
debug epm all
```

`debug epm all` is the one people forget, and it covers authorisation failures — dACL download problems, VLAN assignment issues.

Collect via buffer rather than console:

```
no logging console
logging buffered 7 10000000
logging buffered debugging
```

Then read it back:

```
show logging
```

A ten-megabyte buffer sounds excessive until you're debugging a busy access switch and the interesting entries have already rolled off.

## The Windows service nobody checks

**Wired AutoConfig (DOT3SVC)** performs 802.1X on Ethernet interfaces in Windows. It is **not** started by default on many builds.

```
sc config dot3svc start= auto
net start dot3svc
```

A Windows machine with the service stopped will never send EAPOL-Start. It falls to MAB, appears in Live Logs as an unexpected MAB endpoint, and the investigation goes looking at certificates and policy for an hour before anyone checks a service.

Push it via GPO across the estate before you start phase two, and you avoid the entire class of problem.

## The order that works

1. Monitor Mode across a pilot area, for weeks
2. Read Live Logs. Identify every device without a supplicant.
3. Fix what can be fixed. Document what can't and needs MAB.
4. Build profiling policies so MAB endpoints are identified, not just permitted.
5. Low Impact Mode with a pre-auth ACL. Run it for weeks.
6. Design and **test** Critical ACL and Critical MAB.
7. Closed Mode, one switch at a time, with a rollback plan.

The temptation is always to compress this. The teams that compress it are the teams that end up rolling back in front of an audience.

---

**References**

- [Cisco IBNS 2.0 configuration on IOS](https://www.wiresandwi.fi/blog/solid-config-cisco-ibns-2-0-802-1x-mab-switch-configuration-ios)
- [Cisco IBNS 2.0 webinar](https://www.youtube.com/watch?v=ivfP1rJrtfU)
