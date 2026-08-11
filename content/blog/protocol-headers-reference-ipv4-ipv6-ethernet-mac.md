---
title: "Reading Protocol Headers: IPv4, IPv6, Ethernet and the MAC Address"
excerpt: "Every field in the IPv4 and IPv6 headers and what it's actually for, how IPv6 simplified things, the structure of a MAC address, and the Ethernet frame you see in every capture."
date: "2026-02-12"
tags: ["Networking", "IPv4", "IPv6", "Ethernet", "Fundamentals", "Packet Analysis"]
draft: false
---

## Cheat sheet

**IPv4 header — 20 bytes minimum**

| Field | Size | Purpose |
|---|---|---|
| Version | 4 bits | Always 4 |
| IHL | 4 bits | Header length in 32-bit words |
| DSCP / ECN | 8 bits | QoS marking and congestion notification |
| Total Length | 16 bits | Header + payload |
| Identification | 16 bits | Groups fragments of one datagram |
| Flags | 3 bits | DF (Don't Fragment), MF (More Fragments) |
| Fragment Offset | 13 bits | Where this fragment sits in the original |
| TTL | 8 bits | Decremented per hop; zero = drop + ICMP type 11 |
| Protocol | 8 bits | 1=ICMP, 6=TCP, 17=UDP, 50=ESP, 51=AH |
| Header Checksum | 16 bits | Header only — recalculated at every hop |
| Source / Destination | 32 bits each | Addresses |
| Options | Variable | Rare |

**IPv6 header — 40 bytes, fixed**

| Field | Size | Purpose |
|---|---|---|
| Version | 4 bits | Always 6 |
| Traffic Class | 8 bits | QoS |
| Flow Label | 20 bits | Identifies a flow for per-flow handling |
| **Payload Length** | 16 bits | **Length of packet including headers** (excludes the fixed 40-byte header) |
| Next Header | 8 bits | The next header type — same values as IPv4's Protocol field |
| Hop Limit | 8 bits | IPv4's TTL, renamed |
| Source / Destination | 128 bits each | Addresses |

**Removed in IPv6:** header checksum · fragmentation fields in the base header (fragmentation is an extension header, and only the source may fragment) · IHL, because the header is fixed length.

**MAC address — 48 bits**

| Part | Size | Meaning |
|---|---|---|
| OUI | 24 bits | Organizationally Unique Identifier, assigned by IEEE |
| Vendor assigned | 24 bits | Chosen by the manufacturer |
| **I/G bit** | bit 1 | 0 = unicast, 1 = broadcast/multicast |
| **U/L bit** | bit 2 | 0 = globally unique (OUI enforced), 1 = locally administered |

---

Every capture you open shows the same layers in the same order. Being able to read them without looking anything up is one of those skills that pays back constantly.

## The IPv4 header

Twenty bytes when there are no options, which is almost always.

**Version** — 4. Four bits, and always the same value in IPv4.

**IHL (Internet Header Length)** — the header length in 32-bit words. Minimum 5 (20 bytes). It exists because options make the header variable-length. When you see 5, there are no options.

**DSCP and ECN** — the byte formerly called Type of Service. DSCP carries the QoS marking (EF for voice, AF classes for data), ECN signals congestion without dropping packets. If QoS isn't working, this is the byte to look at in a capture — the marking is often being cleared somewhere in the path.

**Total Length** — header plus payload, in bytes. Sixteen bits, so a maximum of 65,535 — though Ethernet's MTU caps you far below that in practice.

**Identification, Flags, Fragment Offset** — the fragmentation machinery.

Identification groups fragments belonging to the same original datagram. The Flags field carries **DF (Don't Fragment)** and **MF (More Fragments)**. Fragment Offset says where this piece belongs.

**The DF bit is where Path MTU Discovery lives.** Set DF, send a packet too large for some link along the path, and the router can't fragment it — so it drops it and returns ICMP type 3 code 4. That's the mechanism, and blocking that ICMP message is what creates PMTUD black holes.

**TTL (Time To Live)** — decremented by every router. At zero the packet is dropped and ICMP type 11 is returned. This is what makes traceroute possible, and what stops routing loops circulating forever.

TTL is also a weak fingerprint. Different operating systems use different initial values — 64 for Linux and macOS, 128 for Windows, 255 for many network devices. Count backwards from the nearest of those and you get the hop count.

**Protocol** — what's inside. The values worth knowing:

| Value | Protocol |
|---|---|
| 1 | ICMP |
| 2 | IGMP |
| 6 | TCP |
| 17 | UDP |
| 50 | ESP |
| 51 | AH |
| 89 | OSPF |

**Header Checksum** — covers the header only, not the payload. Because TTL changes at every hop, this must be recalculated at every hop. That's real per-packet work, which is precisely why IPv6 removed it.

**Source and Destination** — 32 bits each.

## The IPv6 header

Forty bytes, fixed, and deliberately simpler.

**Version** — 6.

**Traffic Class** — the DSCP equivalent.

**Flow Label** — 20 bits identifying a flow, so routers can apply consistent handling to related packets without inspecting deeper. Under-used in practice.

**Payload Length** — the length of the packet including headers, excluding the fixed 40-byte base header. Extension headers count as payload.

**Next Header** — what follows. Same numbering as IPv4's Protocol field, but it can also point to an extension header, which then points to the next thing. A chain rather than a single field.

**Hop Limit** — TTL, renamed to describe what it actually does. It was always a hop count, never a time.

**Source and Destination** — 128 bits each. Which is most of why the header is bigger despite having fewer fields.

### What IPv6 removed, and why

**The header checksum.** Layer 2 has a CRC and layer 4 has its own checksum. The IP-layer one was redundant, and removing it means routers no longer recalculate anything per hop. This is a genuine forwarding performance improvement.

**Fragmentation from the base header.** In IPv6, **only the source may fragment** — routers never do. If a packet is too large, the router returns ICMPv6 Packet Too Big and the source deals with it. Fragmentation, when needed, uses an extension header.

This makes PMTUD mandatory rather than optional in IPv6, which in turn makes blocking ICMPv6 genuinely fatal rather than merely unwise.

**IHL.** The base header is always 40 bytes, so there's nothing to describe. Variable content moved to extension headers.

## The MAC address

Forty-eight bits, in two halves.

**The first 24 bits are the OUI** — Organizationally Unique Identifier, assigned by the IEEE to the manufacturer.

**The last 24 bits are vendor assigned** — the manufacturer allocates these however it likes.

That split is why OUI lookup works. `00:1B:54` is Cisco; `00:50:56` is VMware. It's also the foundation of the simplest form of device profiling — an ISE profiling policy that says "MAC OUI belongs to a printer manufacturer" is reading exactly this.

### Two bits worth knowing

Within the first byte:

**I/G bit (bit 1) — Individual/Group.**
- `0` = individual address (unicast)
- `1` = broadcast or multicast

**U/L bit (bit 2) — Universal/Local.**
- `0` = globally unique — the OUI is enforced by the IEEE
- `1` = locally administered — someone set this address manually

**Why the U/L bit matters operationally:** modern phones and laptops use randomised MAC addresses for privacy, and randomised addresses have the locally administered bit set. If your NAC deployment relies on MAB, a device with a randomised MAC gets a different address on every connection and never matches anything.

Checking the U/L bit tells you immediately whether you're looking at a real hardware address or a randomised one. It's the first thing to check when an endpoint keeps appearing as a new unknown device.

## The Ethernet frame

What wraps everything above.

| Field | Size |
|---|---|
| Preamble + SFD | 8 bytes |
| Destination MAC | 6 bytes |
| Source MAC | 6 bytes |
| 802.1Q tag (optional) | 4 bytes |
| EtherType / Length | 2 bytes |
| Payload | 46–1500 bytes |
| FCS | 4 bytes |

**EtherType** identifies the payload:

| Value | Protocol |
|---|---|
| 0x0800 | IPv4 |
| 0x0806 | ARP |
| 0x86DD | IPv6 |
| 0x8100 | 802.1Q VLAN tag |
| 0x888E | **EAPOL** — 802.1X authentication |

That last one is worth remembering. When you're capturing on a port to debug 802.1X, filtering on EtherType `0x888E` isolates exactly the authentication conversation and nothing else.

**The 802.1Q tag** adds 4 bytes carrying the VLAN ID and priority. Its presence is why a tagged frame can be 1518 bytes rather than 1514, and why some equipment needs "baby giant" support.

**Minimum payload of 46 bytes** is a legacy of collision detection on shared media — a frame had to be long enough that a collision would be detected before transmission finished. Short payloads get padded.

**FCS** — the frame check sequence, a CRC over the whole frame. A switch reporting CRC errors on an interface is telling you about physical layer problems: a bad cable, a duplex mismatch, or failing optics. It's one of the most useful counters on any switch and one of the least often looked at.

## Reading a capture efficiently

The order that saves time:

**Ethernet** — are the MACs what you expect? Is there a VLAN tag, and is it the right VLAN?

**IP** — right source and destination? What's the TTL, and does it suggest the right number of hops? Is the DF bit set?

**Protocol field** — is this actually the protocol you think it is?

**Layer 4** — for TCP, does the handshake complete? What MSS was negotiated?

Most problems announce themselves in the first three steps. A frame arriving with an unexpected VLAN tag, or a TTL implying twenty hops on what should be a local segment, tells you something structural before you've looked at any payload.

---

Header structure is the vocabulary of packet analysis. Once these fields are familiar, a capture stops being a wall of hex and becomes a readable account of what the network actually did.
