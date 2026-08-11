---
title: "ICMP Types and Codes: The Complete Reference and What Each One Tells You"
excerpt: "ICMP carries the network's own status messages. Here's the full type and code table, what each failure actually means diagnostically, and why blocking ICMP breaks Path MTU Discovery."
date: "2025-12-11"
tags: ["Networking", "ICMP", "Troubleshooting", "Fundamentals"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Full name** | Internet Control Message Protocol |
| **Transport** | **None.** ICMP sits directly on IP. |
| **Ports** | **ICMP has no concept of ports.** |
| **Purpose** | Carries information about the state of the *network itself*, not application data. |
| **Header** | Type (8 bits) · Code (8 bits) · Checksum (16 bits) |
| **Type** | A brief explanation of what the message is for |
| **Code** | Additional detail about the specific error within that type |
| **Checksum** | Message integrity check |

**The types you'll actually meet:**

| Type | Meaning |
|---|---|
| **0** | Echo Reply (ping response) |
| **3** | Destination Unreachable |
| **5** | Redirect Message |
| **8** | Echo Request (ping) |
| **11** | Time Exceeded (TTL expiry — this is how traceroute works) |
| **30** | Traceroute / Information Request |

**Don't block:** Type 3 Code 4 (fragmentation needed) — blocking it breaks Path MTU Discovery and produces connections that establish then hang.

---

ICMP is the protocol that tells you why something didn't work.

It doesn't carry your data. It carries the network's commentary on your data — that the destination was unreachable, that the packet lived too long, that there's a better route, that the packet was too big to forward.

That makes it the single most useful diagnostic protocol available, and it's routinely blocked by firewall administrators who think it's just ping.

## The header, and why it's this simple

ICMP has no transport layer beneath it. It sits directly on IP, which is deliberate — a protocol reporting on the health of the network can't depend on the network being healthy enough for a transport handshake.

Three fields matter:

**Type (8 bits)** — a brief explanation of what the message is for.

**Code (8 bits)** — the next 8 bits represent the message type code, which provides additional information about the error type.

**Checksum (16 bits)** — the last 16 bits provide a message integrity check.

The type/code pairing is the important structure. Type tells you the category; code tells you the specific reason. "Destination Unreachable" is type 3, but *why* it was unreachable is entirely in the code, and that's the part with diagnostic value.

## Type 0 and Type 8 — Echo

| Type | Code | Meaning |
|---|---|---|
| 8 | 0 | Echo request (used to ping) |
| 0 | 0 | Echo reply (used to ping) |

Ping sends type 8, expects type 0 back. That's the whole mechanism.

**What a successful ping actually proves:** layer 3 connectivity in both directions, and that the destination's IP stack is responding. That's it.

**What it does not prove:** that any service is running, that any TCP port is open, or that the application works. Because ICMP has no ports, a successful ping tells you nothing about layer 4. The number of times "but I can ping it" has been offered as evidence that a firewall isn't blocking anything is remarkable.

## Type 3 — Destination Unreachable

The richest type, and the one worth knowing properly. The code tells you which part of the path gave up and why.

| Code | Meaning |
|---|---|
| 0 | Destination network unreachable |
| 1 | Destination host unreachable |
| 2 | Destination protocol unreachable |
| 3 | Destination port unreachable |
| 4 | Fragmentation required, and DF flag set |
| 5 | Source route failed |
| 6 | Destination network unknown |
| 7 | Destination host unknown |
| 8 | Source host isolated |
| 9 | Network administratively prohibited |
| 10 | Host administratively prohibited |
| 11 | Network unreachable for ToS |
| 12 | Host unreachable for ToS |
| 13 | Communication administratively prohibited |
| 14 | Host Precedence Violation |
| 15 | Precedence cutoff in effect |

### The ones with real diagnostic value

**Code 0 — network unreachable.** A router had no route to the destination network. This is a routing problem, and the source IP of the ICMP message tells you *which* router gave up — enormously useful.

**Code 1 — host unreachable.** The network was reached; the specific host didn't answer ARP. Usually the host is off, or the ARP entry is wrong.

**Code 3 — port unreachable.** The host is up and reachable, but nothing is listening on that UDP port. This is the one that makes UDP debugging possible at all, and it's how `traceroute` on Unix detects arrival at the destination.

**Code 4 — fragmentation required and DF set.** Explained below. This is the one you must not block.

**Codes 9, 10 and 13 — administratively prohibited.** A firewall or ACL dropped it deliberately. Genuinely helpful: it tells you the packet reached a policy enforcement point and was refused, rather than vanishing into a routing black hole. Many firewalls are configured to drop silently instead, which is more secure and much harder to troubleshoot.

## Type 3 Code 4 and Path MTU Discovery

This deserves its own section because blocking it causes one of the most confusing failure modes in networking.

**How PMTUD works:** a host sends packets with the Don't Fragment bit set. If a router along the path has an MTU smaller than the packet, it cannot fragment it, so it drops it and returns **ICMP type 3 code 4** — fragmentation required. The message includes the MTU that would have worked. The sender reduces its packet size and continues.

**When that ICMP message is blocked:** the sender never learns. It keeps sending packets that are silently dropped.

**The symptom is distinctive:** small transfers work perfectly. The TCP handshake completes. Then the connection hangs the moment real data flows. SSH connects and shows a prompt, then freezes on any command producing output. HTTPS negotiates and stalls on the first large response.

This gets diagnosed as an application problem, a server problem, or a "slow network" for hours, because everything that should be working *is* working. It's called a PMTUD black hole, and it's almost always a firewall dropping ICMP wholesale.

**If you take one thing away:** never block ICMP type 3 code 4.

## Type 11 — Time Exceeded

| Code | Meaning |
|---|---|
| 0 | TTL expired in transit |
| 1 | Fragment reassembly time exceeded |

**Code 0 is how traceroute works.** Send a packet with TTL 1 — the first router decrements it to zero, drops it, and returns type 11. Now you know hop one. Send TTL 2, learn hop two. Repeat.

That's the entire mechanism. Traceroute isn't a protocol; it's a clever use of TTL expiry and ICMP.

**Code 0 also indicates routing loops.** If a destination is unreachable and you're seeing TTL expiry, packets are circulating between routers until the TTL runs out. A traceroute showing the same two hops alternating is a routing loop, visible immediately.

## Type 5 — Redirect

| Code | Meaning |
|---|---|
| 0 | Redirect datagram for the network |
| 1 | Redirect datagram for the host |
| 2 | Redirect datagram for the ToS and network |
| 3 | Redirect datagram for the ToS and host |

A router telling a host "there's a better first hop for this destination — use that one instead". It happens when a host's default gateway isn't the optimal router for a particular destination on the same segment.

**Security note:** ICMP redirects can be abused to divert traffic, which is why most hardened builds ignore them and many networks disable sending them (`no ip redirects`). If you see them in a capture, it usually means suboptimal routing worth fixing at the source rather than papering over with redirects.

## Type 30 — Traceroute / Information Request

Defined for traceroute purposes, though in practice the TTL-expiry method using type 11 is what implementations actually use.

## What to permit on a firewall

The reflexive "block all ICMP" is a mistake that costs more in diagnostic time than it gains in security.

A reasonable baseline:

**Permit inbound:**
- Type 3 code 4 — **essential**, PMTUD
- Type 3 (other codes) — useful for diagnostics
- Type 11 — traceroute and loop detection
- Type 0 — echo reply, if you want outbound ping to work

**Permit outbound:**
- Type 8 — echo request, so your team can ping
- Type 3, type 11

**Consider blocking inbound:**
- Type 8 from the internet, if you'd rather not answer external pings — though this is closer to obscurity than security
- Type 5 — redirects, which have genuine abuse potential

The security argument against ICMP is mostly about reconnaissance and covert channels. Both are real but modest. The operational cost of blocking type 3 code 4 is not modest, and the resulting failures look like everything except a firewall problem.

## ICMPv6 does more

Worth knowing: in IPv6, ICMP is not optional. **Neighbor Discovery** — IPv6's replacement for ARP — is carried inside ICMPv6. So is Router Advertisement, which is how hosts get their addresses under SLAAC.

Blocking ICMPv6 the way people block ICMPv4 doesn't degrade diagnostics; it breaks the network entirely. Hosts can't resolve neighbours or discover routers.

---

ICMP is the network telling you what happened. Type gives you the category, code gives you the reason, and the source address of the message tells you which device made the decision. That's three pieces of diagnostic information in a packet most people filter out by default.
