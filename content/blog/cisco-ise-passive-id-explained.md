---
title: "Cisco ISE Passive Identity: Authentication Without a Supplicant"
excerpt: "How Passive ID learns who is logged in without any endpoint configuration, the providers it can use, where it's the right answer, and the accuracy limits you need to design around."
date: "2026-02-26"
tags: ["Cisco ISE", "Passive ID", "Identity", "pxGrid", "Active Directory"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **What it is** | ISE learns user-to-IP mappings by *observing* authentication that happened elsewhere — not by authenticating the endpoint itself. |
| **Persona** | A service under the **PSN** persona. **Enable it per PSN.** |
| **Supplicant** | **None required.** There is no supplicant configuration in Passive ID. |
| **Endpoint config** | None. You can simply disable the network adaptors — nothing on the endpoint changes. |
| **Main provider** | Active Directory — reading domain controller security event logs (WMI or the AD agent). |
| **Other providers** | Syslog, REST API, SPAN, DHCP, Kerberos, Terminal Services agent |
| **Output** | Published over **pxGrid** to firewalls, web proxies and analytics tools |
| **What it is not** | Access control. Passive ID *identifies*; it does not authenticate or authorise the endpoint. |
| **Debug** | `PassiveID` → `passiveid*` · `runtime-AAA` → `prrt-server.log` · `Active Directory` → `ad_agent.log` · `collector` → `collector.log` |

---

Not every network can run 802.1X. Sometimes the endpoints won't support it, sometimes the political cost of touching every device is too high, and sometimes you only need to *know* who is where — not to control it.

Passive Identity is ISE's answer to that. It learns which user is behind which IP address by observing authentication that already happened somewhere else, and shares that knowledge with whatever needs it.

## What "passive" actually means

**Passive ID is a service under the PSN persona, and you enable it per PSN.**

The word passive is doing real work. ISE isn't in the authentication path at all. Nobody authenticates *to* ISE. Instead ISE watches a system that does authenticate — usually Active Directory — and correlates the result to an IP address.

**There is no supplicant configuration required.** Nothing changes on the endpoint. You can simply disable the network adaptors and the device behaves normally, because nothing was ever installed or configured on it.

That's the entire appeal. Zero endpoint touch, zero user disruption, and it works on devices you don't manage and can't configure.

## How it learns

The primary mechanism is **Active Directory**.

When a user logs into a domain-joined machine, the domain controller writes a security event to its event log — recording the account, the machine and the source address. ISE reads those events, either through **WMI** or through the **Active Directory agent** installed on the domain controller.

From that event, ISE builds a mapping: `10.20.30.40 → DOMAIN\jsmith`. It holds that mapping until it expires or is superseded.

**The AD agent versus WMI:** WMI needs no software on the domain controller but is heavier and more fragile at scale — permissions, DCOM, firewall rules. The agent is a small install that pushes events to ISE and is generally more reliable in larger environments. Most production deployments end up on the agent.

### Other providers

Active Directory is the common case, but not the only one:

**Syslog** — parse login events from any system that logs them. VPN concentrators, wireless controllers, and third-party appliances all work if you can write the parser.

**REST API** — another system pushes mappings to ISE directly. Useful for custom integration.

**SPAN** — observe authentication traffic on a mirrored port and derive mappings from it.

**DHCP** — correlate address assignment with hostname, giving a weaker device-level mapping rather than a user one.

**Kerberos** — observe ticket activity.

**Terminal Services agent** — the specialist one. On a shared terminal server, many users share one IP address, so an IP-to-user mapping is meaningless. The TS agent allocates a port range per user session, so consumers can distinguish them by source port.

## Where the identity goes

Passive ID's output is published over **pxGrid**.

Subscribers use it to make identity-aware decisions:

**Firewalls** — Firepower writes rules against users and groups rather than address ranges.

**Web proxies** — apply per-user browsing policy without a separate authentication prompt.

**Analytics platforms** — StealthWatch attaches usernames to flow records, so an investigation names people rather than addresses.

**The value is the join.** Each of those tools already sees IP addresses. What they lack is the mapping to identity, and that mapping is exactly what ISE has.

## Where Passive ID is the right answer

**You need identity for policy, not for access control.** The firewall should know who a user is; the switch port doesn't need to authenticate them.

**802.1X isn't feasible.** Legacy endpoints, unmanaged devices, an environment where deploying supplicants isn't going to happen.

**You want visibility before enforcement.** Passive ID gives you a picture of who is on the network with no risk of blocking anyone — a genuinely useful precursor to a NAC project.

**A rollout is phased.** Passive ID covering the whole estate while 802.1X is deployed area by area gives you continuous identity coverage during the transition.

## The limits you must design around

This is where honest assessment matters, because Passive ID is often positioned as an alternative to 802.1X and it isn't one.

### It is not authentication

Passive ID observes; it does not verify. It tells you a login event occurred, and it correlates that to an address. An endpoint that never logs into the domain is invisible to it, and an attacker who plugs into a port and takes an IP address is entirely unimpeded.

**Passive ID gives you identity. It gives you no access control whatsoever.** If someone presents it as a NAC solution, that's the distinction to raise.

### Mappings go stale

The mapping is created at login. It persists until something updates or expires it.

That produces real inaccuracy. A user logs out and someone else logs into the same machine — until the new event is processed, the old mapping stands. A DHCP lease is reassigned to a different device and the mapping follows the address, not the person. A user with a laptop and a phone has two addresses and one of them may be attributed wrongly.

**The design consequence:** set mapping timeouts deliberately. Too long and you're acting on stale identity; too short and you lose coverage between logins. And don't build controls that would be dangerous if the mapping were wrong.

### Shared IPs break it

NAT, terminal servers, and any many-to-one address translation collapse multiple users into one address. The Terminal Services agent handles the terminal server case specifically; general NAT is a harder problem.

### It depends on the domain controllers

If ISE can't read the security event logs — permissions changed, WMI broken, agent stopped, DC added without being configured in ISE — mappings stop appearing for the users that DC serves.

**And it is quiet when it fails.** Nobody is blocked; identity simply stops arriving, and downstream policy silently starts matching different rules. Monitor the provider status rather than assuming it's working.

## Troubleshooting

Set these under Operations → Troubleshoot → Debug Wizard:

- `PassiveID` → `passiveid*`
- `runtime-AAA` → `prrt-server.log`
- `Active Directory` → `ad_agent.log`
- `collector` → `collector.log` — on PassiveID and MnT nodes, and on the active pxGrid node if sessions are published
- `pxGrid` → `pxgrid/` — on the secondary MnT and the active pxGrid node if sessions are published

**Working through a failure:**

**No mappings at all.** Check the provider status. For AD, confirm ISE can read the security event log — this is usually a permissions problem, and the account needs specific rights on the domain controller.

**Some users mapped, others not.** You're probably missing a domain controller. Users authenticating against an unconfigured DC produce no events for ISE to read. Every DC that authenticates users needs to be a configured source.

**Mappings appear but consumers don't see them.** That's pxGrid, not Passive ID. Check the pxGrid service and the subscriber's connection.

**Wrong user attributed to an address.** Stale mapping. Look at the timeout configuration and at whether logout events are being captured — many environments capture logins reliably and logouts not at all.

## A realistic position

Passive ID is genuinely useful and frequently oversold.

It is excellent at giving your existing security tools identity context they otherwise lack, at zero cost to the endpoint estate. A firewall that can write rules about people instead of subnets is meaningfully better, and Passive ID gets you there without touching a single device.

It is not access control, its mappings are approximate, and it fails quietly. Design with those three facts in view and it earns its place. Position it as a substitute for 802.1X and it will eventually be found out.

The sensible pattern in most environments: Passive ID everywhere for identity context, 802.1X progressively for actual control.
