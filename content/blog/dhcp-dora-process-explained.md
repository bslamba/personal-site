---
title: "DHCP DORA Explained: The Four Messages, Relay Agents and Why It Breaks"
excerpt: "Discover, Offer, Request, Acknowledge — what each message actually contains, how ip helper-address makes it work across subnets, and the DHCP options that matter for NAC and profiling."
date: "2025-12-18"
tags: ["Networking", "DHCP", "Fundamentals", "Troubleshooting", "Profiling"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **D** | **Discover** — client broadcasts looking for any DHCP server |
| **O** | **Offer** — server offers an address |
| **R** | **Request** — client formally requests that offer (broadcast, so other servers know) |
| **A** | **Acknowledge** — server confirms, lease begins |
| **Transport** | UDP |
| **Ports** | Server **67**, Client **68** |
| **Discover is** | A broadcast — which is why it doesn't cross routers on its own |
| **The fix** | `ip helper-address <server>` on the client-side SVI |
| **Lease renewal** | At 50% (T1) unicast to the server; at 87.5% (T2) broadcast to any server |
| **DHCPNAK** | Server refusing a requested address — usually after a subnet change |
| **DHCPDECLINE** | Client found the offered address already in use |
| **DHCPRELEASE** | Client giving the address back |

**Options worth knowing:** 1 subnet mask · 3 router · 6 DNS · 12 hostname · 15 domain name · 51 lease time · 53 message type · 55 parameter request list · 60 vendor class · 66/67 TFTP server and bootfile (PXE)

---

DHCP is the protocol nobody thinks about until it breaks, at which point an entire floor has no network and everyone thinks about it at once.

The mechanism is four messages. Understanding what's in each one, and which are broadcasts, explains almost every DHCP failure you'll encounter.

## DORA, message by message

### D — Discover

The client has just come up and has no address. It broadcasts a DHCPDISCOVER to `255.255.255.255`, from source `0.0.0.0` port 68, to port 67.

It has to be a broadcast — the client doesn't know where the server is, and having no address of its own, it can't do anything else.

**This broadcast is the reason DHCP relay exists.** Routers don't forward broadcasts. Without help, a client can only ever reach a DHCP server on its own segment.

The Discover carries useful identifying information: the client's MAC, often a hostname (option 12), a vendor class identifier (option 60), and a **parameter request list** (option 55) — the specific set of options this client wants. That request list turns out to be one of the better device fingerprints available, because different operating systems ask for different options in a different order.

### O — Offer

A server that has an address available responds with a DHCPOFFER containing the proposed address, subnet mask, gateway, DNS servers, and lease duration.

If several servers exist, the client may get several offers. It takes one, normally the first.

### R — Request

The client broadcasts a DHCPREQUEST naming the address it's accepting and the server it's accepting from.

**It's broadcast deliberately.** The other servers that made offers see it, notice they weren't chosen, and release their reserved addresses back to the pool. If this were unicast, unchosen servers would hold reservations until they timed out.

### A — Acknowledge

The server confirms with a DHCPACK. The lease is now active and the client configures its interface.

If something has changed and the server can't honour the request, it sends a **DHCPNAK** instead, and the client starts again from Discover.

## Crossing subnets: the relay agent

Since Discover is a broadcast and routers don't forward broadcasts, a client on VLAN 10 cannot reach a DHCP server in the data centre without help.

`ip helper-address` is that help:

```
interface Vlan10
 ip address 10.10.10.1 255.255.255.0
 ip helper-address 10.2.2.10
```

The router receives the broadcast, converts it to a unicast addressed to the server, and — importantly — inserts its own interface address in the **giaddr** field. The server uses giaddr to work out which scope to allocate from. That's how one server can serve hundreds of subnets.

**Multiple helpers are allowed:**

```
interface Vlan10
 ip helper-address 10.2.2.10
 ip helper-address 10.2.2.11
```

Both receive the relayed request. Both may offer; the client picks one.

### The NAC connection

This is where DHCP becomes relevant to network access control. Adding the ISE Policy Service Node as an additional helper address feeds the DHCP profiling probe:

```
interface Vlan10
 ip helper-address 10.2.2.10
 ip helper-address 10.1.1.1
```

ISE now sees the DHCP conversation and can profile endpoints from hostname, vendor class and parameter request list. It's the single highest-value profiling probe after RADIUS, and this is the whole configuration required.

Confirm your actual DHCP server tolerates it — you're adding a destination for broadcasts, and while ISE won't answer, some environments have strict change control around anything touching DHCP.

## The options that matter

DHCP carries far more than an address. The options worth recognising:

| Option | Purpose |
|---|---|
| 1 | Subnet mask |
| 3 | Default gateway (router) |
| 6 | DNS servers |
| 12 | Hostname |
| 15 | Domain name |
| 42 | NTP servers |
| 43 | Vendor-specific information |
| 51 | Lease time |
| 53 | DHCP message type (which of DORA this is) |
| 55 | Parameter request list |
| 60 | Vendor class identifier |
| 66 | TFTP server name |
| 67 | Bootfile name |
| 82 | Relay agent information |
| 150 | TFTP server address (Cisco, used by IP phones) |

**Options 66, 67 and 150 are the PXE and voice ones.** If machines network-boot, or IP phones need to find their configuration, these are how. A pre-authentication ACL in an 802.1X deployment that doesn't permit TFTP will break both, and the symptom — a phone that never registers, a PC that won't image — looks nothing like a DHCP problem.

**Option 82** is inserted by the relay agent and identifies the specific switch port the request came from. Useful for security and for tracking.

**Options 12, 55 and 60 are the fingerprinting ones**, as covered above.

## Lease renewal

Leases don't just expire; they're renewed progressively.

**T1, at 50% of the lease** — the client unicasts a DHCPREQUEST directly to the server that granted the lease. Normally the server ACKs and the lease resets.

**T2, at 87.5%** — if T1 got no answer, the client broadcasts, asking any server to renew.

**At 100%** — the lease expires. The client gives up the address and starts from Discover.

This staged approach is why a DHCP server can be down for a while without anyone noticing. Clients keep their addresses until T1 fails, and even then have most of the remaining lease to find an alternative. A short lease time reduces that grace period — worth remembering before setting aggressive lease durations in the name of address conservation.

## How it breaks

**No helper-address.** Clients on the local segment work; everyone else gets nothing. Classic symptom of a new VLAN configured without the helper.

**Helper points at the wrong address.** Same symptom, and harder to spot because the configuration looks present.

**Pool exhausted.** New clients fail, existing ones keep working — because they're renewing, not requesting. Distinctive symptom, and it points straight at pool sizing or an unusually large lease time.

**Rogue DHCP server.** Someone plugs in a home router. It answers Discovers faster than the real server, and clients get addresses on the wrong subnet with a gateway that goes nowhere. Affects some clients and not others depending on who answered first.

The mitigation is **DHCP snooping**:

```
ip dhcp snooping
ip dhcp snooping vlan 10
interface GigabitEthernet1/0/1
 ip dhcp snooping trust
```

Only trusted ports may send DHCP server messages. Everything else is dropped. This should be standard on every access switch, and it's frequently absent.

**DHCPNAK loop.** A client requests an address from a subnet it's no longer on — typically after being moved between VLANs. The server NAKs, the client requests again, round it goes. Usually fixed by releasing the lease on the client.

**Client gets 169.254.x.x.** APIPA. The client got no response at all. This means Discover isn't reaching a server or the answer isn't coming back — not that the server refused, which would produce a NAK.

## Debugging it

**On the switch:**

```
show ip dhcp snooping binding
debug ip dhcp server packet
```

**On the router doing relay:**

```
show ip interface Vlan10 | include Helper
debug ip dhcp server events
```

**In a capture**, filter on `bootp` in Wireshark — DHCP still uses the BOOTP filter name for historical reasons, which catches people out.

Watch for which of the four messages is missing. Discover present but no Offer means the request isn't reaching the server, or the server has nothing to give. Offer present but no Request means the client rejected it. Request present but a NAK means the server disagrees with what was asked for.

That single observation — which message is missing — narrows the cause faster than anything else.

---

Four messages, two ports, one broadcast that needs help crossing a router. Most DHCP problems are one of those three facts not holding.
