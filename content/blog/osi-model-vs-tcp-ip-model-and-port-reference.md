---
title: "OSI vs TCP/IP Model, and Which Protocols Don't Use Ports at All"
excerpt: "The two models compared honestly, plus a reference table of common protocols and ports — including the ones that have no transport layer and therefore no port numbers, which is where most confusion starts."
date: "2025-12-04"
tags: ["Networking", "OSI Model", "TCP/IP", "Fundamentals", "Ports"]
draft: false
---

## Cheat sheet

| | OSI | TCP/IP |
|---|---|---|
| **Layers** | 7 | 4 |
| **Created by** | ISO (International Standards Organization) | ARPANET (Advanced Research Projects Agency Network) |
| **Nature** | Logical and conceptual | Practical, built from working protocols |
| **Used for** | Teaching, troubleshooting vocabulary | How the internet actually works |

**Protocols with no transport layer — and therefore no ports:**

| Protocol | Transport | Ports |
|---|---|---|
| IP, IPv4, IPv6 | None | None |
| ICMP / ICMPv4 / ICMPv6 | None | **No concept of ports** |
| IGMP | None | None |
| ARP | None | None |
| Neighbor Discovery (ND) | None | None |
| IP NAT | None | None |

**Common ports worth memorising:**

| Service | Transport | Port |
|---|---|---|
| FTP | TCP | 20 (data), 21 (control) |
| SSH | TCP | 22 |
| Telnet | TCP | 23 |
| SMTP | TCP | 25 |
| DNS | UDP/TCP | 53 |
| DHCP | UDP | 67 (server), 68 (client) |
| TFTP | UDP | 69 |
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |
| IPsec (IKE / NAT-T) | UDP | 500, 4500 |
| RADIUS | UDP | 1812/1813 (auth/acct) |
| RADIUS CoA | UDP | 3799 (or 1700 legacy) |

---

Everyone learns the OSI model. Rather fewer people can say why we still teach a seven-layer model when the internet runs on a four-layer one.

The short answer: OSI is a vocabulary, TCP/IP is an implementation. You troubleshoot in OSI and you build in TCP/IP.

## Two models, two purposes

**OSI** was developed by the **International Standards Organization** as a logical and conceptual model — a description of how networking *ought* to be layered, produced before the protocols existed to fill it.

**TCP/IP** was developed by **ARPANET**, and it's the reverse: a description derived from protocols that already worked. That's why it's the more practical model, and why the internet runs on it.

The four TCP/IP layers map onto the seven OSI layers approximately, not exactly:

| TCP/IP | OSI |
|---|---|
| Application | Application, Presentation, Session |
| Transport | Transport |
| Internet | Network |
| Network Access | Data Link, Physical |

The mapping is loose because OSI's presentation and session layers were never separately implemented in practice. TLS is often called "layer 5/6" precisely because it doesn't fit neatly — it sits above transport but below application and belongs cleanly to neither.

## Why OSI is still worth knowing

Because it's the shared language of troubleshooting.

When someone says "it's a layer 2 problem", they have communicated something precise and useful in four words: the issue is in switching, VLANs, MAC addressing or the physical link — not routing, not the application.

"It's a layer 7 problem" narrows it to the application. "Layer 3" means routing.

That vocabulary is why the model survives despite not matching the implementation. It's a diagnostic index.

**The practical method:** work up from layer 1. Is there link? Is the VLAN right? Does it have an IP? Can it route? Is the port open? Does the application respond? Most problems are found before you reach layer 4, and starting at layer 7 wastes time.

## The part that confuses people: protocols without ports

This is the source of a specific, common misconception — that everything on a network has a port number.

Several important protocols **do not use a transport layer at all**, and therefore have no port numbers. They sit directly on IP.

**ICMP** is the clearest case. It has **no concept of ports**. It is designed not to carry application data, but to carry information about the status of the network itself. When someone asks "what port does ping use", the honest answer is that the question doesn't apply.

The same applies to:

- **IP, IPv4, IPv6** — they *are* the network layer; there is nothing below transport for them to use
- **IGMP** — multicast group management, directly on IP
- **ARP** — actually below IP, resolving IP to MAC on the local segment
- **Neighbor Discovery (ND)** — IPv6's replacement for ARP, carried inside ICMPv6
- **IP NAT** — a function performed on packets, not a protocol with an endpoint

**Why this matters in practice:** you cannot write a firewall rule permitting "ICMP port 8". You permit ICMP by type and code. Attempting to filter it by port produces rules that either do nothing or block everything, and both are confusing to debug.

**IPsec** is a useful contrast — it *does* use UDP, on ports 500 (IKE) and 4500 (NAT Traversal), because key exchange genuinely needs a transport. But the ESP payload itself is IP protocol 50, with no ports. This is exactly why IPsec through NAT needs NAT-T: the NAT device has no ports to translate on ESP, so the traffic gets encapsulated in UDP 4500 to give it some.

## The ports worth knowing cold

Not an exhaustive list — an operationally useful one.

**Management and transfer**

| Service | Transport | Port |
|---|---|---|
| FTP | TCP | 20 (data), 21 (control) |
| SSH / SCP / SFTP | TCP | 22 |
| Telnet | TCP | 23 |
| TFTP | UDP | 69 |
| SNMP | UDP | 161 (queries), 162 (traps) |
| Syslog | UDP | 514 |

FTP using two ports is worth understanding — 21 carries commands, 20 carries data, and the data connection is opened separately. That's why FTP through firewalls and NAT is historically painful and why SFTP over 22 is the sane modern choice.

**Web**

| Service | Transport | Port |
|---|---|---|
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |

**Name resolution and addressing**

| Service | Transport | Port |
|---|---|---|
| DNS | UDP 53, TCP 53 | Both |
| DHCP | UDP | 67 server, 68 client |

DNS using both is deliberate: UDP for ordinary queries because it's fast and connectionless, TCP when the response exceeds what fits in a datagram — zone transfers, and large DNSSEC responses. A firewall permitting only UDP 53 will work almost all the time and then fail mysteriously on large responses.

DHCP's two ports catch people out. The client sends *from* 68 *to* 67, and the server replies *from* 67 *to* 68. Both directions need permitting, and the initial request is a broadcast, which is why `ip helper-address` exists at all.

**Mail**

| Service | Transport | Port |
|---|---|---|
| SMTP | TCP | 25 |
| SMTP submission | TCP | 587 |
| SMTPS | TCP | 465 |
| POP3 | TCP | 110 |
| IMAP | TCP | 143 |

**AAA — worth knowing precisely if you work with NAC**

| Service | Transport | Port |
|---|---|---|
| RADIUS authentication | UDP | 1812 (1645 legacy) |
| RADIUS accounting | UDP | 1813 (1646 legacy) |
| RADIUS CoA | UDP | 3799 (1700 legacy Cisco) |
| TACACS+ | TCP | 49 |

Two things stand out here.

**TACACS+ uses TCP, RADIUS uses UDP.** That's a real design difference, not trivia — TACACS+ encrypts the entire payload and separates authentication from authorisation, which is why it's preferred for device administration. RADIUS encrypts only the password field.

**The legacy port pairs matter.** Older equipment defaults to 1645/1646, and a mismatch produces silent failure — the request goes nowhere and nothing is logged, because nothing received it. The CoA 3799/1700 split causes the same problem, and it's the single most common cause of posture and guest flows that authenticate correctly but never change access.

**Remote access**

| Service | Transport | Port |
|---|---|---|
| RDP | TCP | 3389 |
| IPsec IKE | UDP | 500 |
| IPsec NAT-T | UDP | 4500 |
| ESP | IP protocol 50 | No ports |
| AH | IP protocol 51 | No ports |
| L2TP | UDP | 1701 |

## A troubleshooting habit worth forming

When something doesn't work, establish which layer you're actually in before you start.

Can it ping? That's layer 3 working — and note that a successful ping proves nothing about layer 4, because ICMP doesn't use ports.

Can it open a TCP connection to the port? That's layer 4. `telnet host 443` or `nc -zv host 443` answers it in a second.

Does the application respond correctly on that connection? That's layer 7.

The number of hours lost to debugging application configuration when the actual problem was a firewall rule at layer 4 is considerable. Three commands, in order, eliminate it.

---

The models are a shared vocabulary, not a description of reality. Use OSI to name where you are, use TCP/IP to understand what's actually happening, and remember that a good third of the protocols you rely on don't have ports at all.
