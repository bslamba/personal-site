---
title: "What's New in Cisco ISE 3.4 and 3.5, and What It Means in Practice"
excerpt: "Full single-stack IPv6, the Cloud Multi-Factor Classification profiler, SNMPv3 endpoint profiling for IoT, and the pxGrid changes — with an honest view of which ones justify an upgrade."
date: "2026-03-19"
tags: ["Cisco ISE", "IPv6", "Profiling", "pxGrid", "Upgrade"]
draft: false
---

## Cheat sheet

**ISE 3.5**

| Feature | What it means |
|---|---|
| **Full single-stack IPv6 support** | Expanded range of configurations and supported features — portals, RADIUS services, and APIs |
| **Cloud Multi-Factor Classification (MFC) Profiler** | Cloud-assisted endpoint classification |
| **SNMP-based endpoint profiling, up to SNMPv3** | Aimed at IoT that can't authenticate — printers, cameras, building automation |
| **New pxGrid API** | Enhanced endpoint access |
| **pxGrid Cloud** | Expanded to more regions, easier integration |

**ISE 3.4**

| Feature | What it means |
|---|---|
| Better policy enforcement | For devices accessing the network |
| Advanced profiling | Detecting unauthorised users or devices |
| Improved Secure Network Analytics integration | Better threat detection |
| Easier cloud integration | Better compatibility with cloud-native security tools for hybrid setups |

**The honest summary:** 3.5's IPv6 support is the one that unblocks projects. The profiling work is the one that improves day-to-day accuracy.

---

Version releases are usually a list of features and an implicit suggestion that you should upgrade. Worth separating what's genuinely significant from what's incremental, because an ISE upgrade is real work and needs a reason.

## ISE 3.5

### Full single-stack IPv6 support

The headline, and the one that unblocks actual projects.

**ISE 3.5 introduces full single-stack IPv6 support, expanding the range of configurations and supported features such as portals, RADIUS services, and APIs.**

"Single-stack" is the important word. Earlier releases supported IPv6 in a dual-stack arrangement — IPv6 present, but IPv4 still required underneath for parts of the deployment. That's fine when you have both. It's a blocker when you're building an IPv6-only segment, which is increasingly common in service provider environments, in some government deployments, and in large IoT estates where IPv4 address space simply ran out.

**What it unblocks:** deployments where policy dictates IPv6-only, and networks that have run out of RFC 1918 space — which sounds unlikely until you're managing a merged estate with overlapping ranges and hundreds of thousands of endpoints.

**Practical note:** if you have IPv6 anywhere in your access layer, this changes what's possible. If you're IPv4 throughout with no plans, it changes nothing for you.

### Cloud Multi-Factor Classification (MFC) Profiler

Cloud-assisted endpoint classification.

The underlying logic is straightforward: identifying an unfamiliar device from its fingerprint is a pattern-matching problem, and the pattern library benefits from scale. A cloud-backed classifier draws on a much wider corpus than your local profiling policies can.

**Where it helps:** the endpoints that currently land on `Unknown`. Every deployment has them, and every one of them is a device on your network that you can't write meaningful policy for. Improving classification accuracy directly improves how much of your estate you can actually control.

**Worth checking before assuming:** what data leaves your environment, and whether that's acceptable to your security team. Cloud-assisted anything involves sending fingerprints somewhere, and that's a conversation to have before enabling it rather than after.

### SNMP-based endpoint profiling, up to SNMPv3

**Support up to SNMPv3, which is perfect for IoT devices that can't do proper authentication — printers, cameras, building automation systems, and the like.**

SNMP profiling isn't new; support up to v3 matters because v1 and v2c send community strings in clear text. Many security teams — correctly — refuse to permit them. That effectively removed SNMP as a profiling source in environments that most needed it.

SNMPv3 provides authentication and encryption, which makes SNMP profiling acceptable where it previously wasn't.

**Where it helps:** exactly the estate named — printers, cameras, building automation. Devices that will never run a supplicant, that MAB onto the network, and whose only defence against MAC spoofing is accurate profiling. Adding a credible probe for that population is genuinely useful.

### pxGrid changes

**A new pxGrid API enhances endpoint access**, and **pxGrid Cloud has expanded to support additional regions with easier integration.**

The regional expansion matters for anyone who couldn't use pxGrid Cloud previously because of data residency requirements — a real constraint in the EU, India and elsewhere.

## ISE 3.4

The 3.4 release is more incremental, and reads as a consolidation.

**Enhanced policy enforcement** for devices accessing the network. **Advanced profiling capabilities** to detect unauthorised users or devices. **Improved integration with Cisco Secure Network Analytics** for threat detection. **Easier cloud integration**, with better compatibility with cloud-native security tools, helping manage security policies in hybrid setups.

The Secure Network Analytics integration improvement is the one with operational value — tighter coupling between ISE's identity context and StealthWatch's flow analysis means investigations resolve to people faster.

The hybrid cloud work reflects where most estates now are: some workloads on-premises, some in cloud, and a policy model that has to span both without being maintained twice.

## Which of these justifies an upgrade

An honest assessment, since upgrading ISE is not a small change.

**Upgrade for 3.5 if:**

- You need IPv6-only support anywhere. This is the clearest case, and nothing else solves it.
- Your `Unknown` endpoint population is large enough to be a policy problem, and the MFC profiler plus SNMPv3 profiling would materially reduce it.
- You were blocked from pxGrid Cloud by regional availability.

**Upgrade for currency if:**

- You're more than two releases behind. Upgrade paths get harder the further back you start, and support windows close.
- You're approaching end of support on your current version. This is the reason most upgrades actually happen, and it's a legitimate one.

**Don't upgrade if:**

- Your current version is stable, supported, and none of the above applies. ISE upgrades carry real risk, and "newer" isn't a benefit by itself.

## If you do upgrade

Two things worth carrying over from upgrade planning generally.

**Check the supported upgrade path.** Not every version upgrades directly to every other. A large jump may require an intermediate hop, or may be better handled by backup-and-restore onto fresh nodes — which is often cleaner anyway for a big version gap.

**Read the release notes properly, particularly the deprecations.** Feature removals cause more upgrade problems than feature additions. Something your deployment depends on may have been removed or changed in behaviour, and that's the kind of thing you want to discover in the release notes rather than in production.

## The IPv6 point, expanded

Worth dwelling on because it's the change with the longest tail.

Network access control has been quietly IPv4-shaped for a long time. Profiling probes, redirect ACLs, portal URLs, IP-to-SGT mappings, Passive ID mappings — all of it assumes an IPv4 address as the identifier for an endpoint.

IPv6 complicates that in ways that go beyond address length. Endpoints have several addresses simultaneously. Privacy extensions rotate them. SLAAC means the endpoint chooses its own. The stable "this device is at this address" assumption that a lot of NAC design rests on becomes weaker.

Full single-stack support in ISE is the necessary foundation, but the design questions it raises — which address identifies an endpoint, how mappings stay accurate when addresses rotate, how redirect ACLs work — are worth thinking through before you build an IPv6-only access network and discover them one at a time.

---

**References**

- [Release Notes for Cisco ISE 3.5](https://www.cisco.com/c/en/us/td/docs/security/ise/3-5/release_notes/cisco-ise-release-notes-35.html)
- [Release Notes for Cisco ISE 3.4](https://www.cisco.com/c/en/us/td/docs/security/ise/3-4/release_notes/cisco-identity-services-engine-release-notes-34.html)
- [ISE 3.5 Administrator Guide — New and changed information](https://www.cisco.com/c/en/us/td/docs/security/ise/3-5/admin_guide/b_ise_admin_3_5/new_and_changed_info.html)
