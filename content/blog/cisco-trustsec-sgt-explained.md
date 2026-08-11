---
title: "Cisco TrustSec Explained: SGTs, SXP and Policy That Follows the User"
excerpt: "How Security Group Tags decouple policy from IP addressing, the three ways a tag gets propagated, where enforcement actually happens, and why SXP exists at all."
date: "2026-02-19"
tags: ["Cisco ISE", "TrustSec", "SGT", "Segmentation", "Network Security"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **The problem it solves** | ACLs are written against IP addresses. Addresses change; roles don't. |
| **SGT** | Security Group Tag — a 16-bit value representing a *role*, assigned at authentication. |
| **Classification** | Assigning the tag. Usually dynamic, via ISE at authentication. |
| **Propagation** | Getting the tag from where it was assigned to where it's enforced. |
| **Enforcement** | Applying policy based on source and destination tags. |
| **Inline tagging** | The tag travels in the Cisco Meta Data field of the frame. Needs hardware support end to end. |
| **SXP** | SGT Exchange Protocol. Carries IP-to-SGT bindings over TCP where inline tagging isn't possible. |
| **SGACL** | The policy matrix — source SGT × destination SGT → permit/deny. |
| **Enforced on** | Switches, routers, firewalls, and wireless controllers that support it. |
| **Debug** | `sxp`, `sgtbinding` → `sxp_appserver/sxp.log` · `runtime-AAA` → `prrt-server.log` |

---

Traditional segmentation is written in IP addresses. "The finance VLAN is 10.20.0.0/16, so permit 10.20.0.0/16 to the finance servers."

That works until people move, until VLANs are reused, until a merger brings overlapping ranges, and until someone in finance connects from a different floor. The ACL describes topology, but the intent was about role — and the two drift apart continuously.

TrustSec separates them. Policy is written against roles, and the network figures out the addressing.

## Security Group Tags

An **SGT** is a 16-bit number representing a role: Employee, Contractor, Finance, IoT-Camera, Quarantine.

The tag is assigned when the endpoint authenticates. ISE evaluates the authorisation policy and returns the SGT alongside — or instead of — a VLAN and dACL.

From that point on, the endpoint's traffic carries its role identity through the network, and enforcement points make decisions on the tag rather than the address.

**The consequence:** move a user to a different floor, a different building, a different IP range, and the policy still applies. It's attached to who they are, not where they plugged in.

## The three stages

Every TrustSec deployment consists of the same three problems, and they're worth separating because they fail differently.

### 1. Classification — assigning the tag

**Dynamic classification** is the normal case: ISE assigns the SGT in the authorisation result at 802.1X or MAB authentication. Same policy engine, same conditions, one extra attribute returned.

**Static classification** covers everything that doesn't authenticate. You can map an SGT to:

- An IP address or subnet — servers, typically
- A VLAN
- A port
- A subnet learned from routing

Static mappings are how you tag your data centre. Servers rarely do 802.1X, so their tags come from IP-to-SGT mappings configured on the switch or pushed from ISE.

### 2. Propagation — carrying the tag

Two mechanisms, and this is where deployments get complicated.

**Inline tagging** — the SGT travels inside the frame itself, in the **Cisco Meta Data (CMD)** field inserted into the Ethernet header.

Fast, and requires no additional protocol. But it requires **hardware support on every device in the path**. A single switch that doesn't understand CMD will either drop the frame or strip the tag, and either way enforcement downstream stops working.

In practice, most estates have mixed hardware, and inline tagging end to end is achievable only in newer or deliberately refreshed segments.

**SXP — SGT Exchange Protocol** — carries **IP-to-SGT bindings** over a TCP connection instead of tagging frames.

A device that knows an endpoint's tag tells a peer "10.1.1.50 is SGT 10". The peer stores that binding and enforces on it, even though the frames arriving carry no tag at all.

This is the bridge across hardware that can't do inline tagging, and it's how most real deployments actually work.

**SXP peering has a direction.** A **speaker** sends bindings; a **listener** receives them. A device can be both. Getting the roles wrong is a common configuration error — two speakers exchange nothing and the peering looks up while no bindings flow.

**SXP is resource-intensive at scale.** Every binding is state held on every device that needs it, and every authentication generates an update. This is why ISE design guidance suggests dedicating nodes to pxGrid/SXP in medium deployments rather than combining them with administration duties.

### 3. Enforcement — acting on the tag

Policy lives in a matrix: **source SGT × destination SGT → permitted traffic**.

That matrix is configured centrally in ISE and pushed to enforcement devices. An **SGACL** defines what's permitted for a given source/destination pair.

Enforcement happens on switches, routers, firewalls and wireless controllers that support it. Notably, Cisco firewalls can consume SGT information too, which means you can write firewall rules against roles rather than address ranges.

**The design question that matters:** where do you enforce? Close to the source stops unwanted traffic early but requires the tag to be known at the access layer. Close to the destination is simpler to configure but lets traffic traverse the network before being dropped. Most designs do both — coarse enforcement at the edge, fine enforcement in front of sensitive resources.

## What this buys you

**East-west segmentation without VLAN sprawl.** The traditional way to separate two groups on the same floor is two VLANs, two subnets, and routing between them with an ACL. With TrustSec they can share a VLAN and still be prevented from talking, because enforcement is on the tag.

**Policy that survives movement.** No re-addressing, no ACL updates when someone changes desk or site.

**Rapid containment.** Combined with ANC over pxGrid, a compromised endpoint can be reassigned to a Quarantine SGT in seconds, and every enforcement point in the network applies the quarantine policy immediately.

**Readable policy.** A matrix saying "Contractor may not reach Finance-Server" is auditable in a way that a page of ACL entries against subnets is not.

## Where it gets difficult

**Hardware support is uneven.** Inline tagging needs capable hardware end to end. Check the specific platform and software version, not just the product family — support varies within families.

**SXP scaling.** Binding counts grow with endpoint counts, and every listener holds the bindings it needs. Large deployments require careful peering design, often hierarchical rather than full mesh.

**The matrix grows quadratically.** Ten SGTs is 100 cells. Twenty is 400. Resist the urge to create a tag per department; start with a handful of broad roles and split only when a real policy difference demands it.

**Static mappings need maintenance.** Every server subnet mapped to an SGT is a configuration item that must be updated when addressing changes — reintroducing exactly the coupling you were trying to remove, for the part of the estate that doesn't authenticate.

**Troubleshooting spans layers.** A failure could be classification (wrong tag assigned), propagation (tag not arriving), or enforcement (policy wrong). Establish which before investigating.

## Troubleshooting sequence

**1. Was the right tag assigned?** ISE Live Logs shows the SGT in the authorisation result. If it's wrong or absent, the problem is policy, and nothing downstream matters.

**2. Does the enforcement device know the binding?**

```
show cts role-based sgt-map all
```

If the binding isn't there, propagation failed. Check SXP peering, or check inline tagging support on the path.

**3. Is SXP peering healthy?**

```
show cts sxp connections brief
```

Look for `On` state. `Pending On` usually means a speaker/listener role mismatch or a password mismatch.

**4. Is the policy present on the device?**

```
show cts role-based permissions
show cts role-based counters
```

The counters are the useful ones — they show whether traffic is actually hitting the policy. Zero counters on a policy you expect to be busy means traffic isn't being classified as you think.

**5. On ISE**, set these to debug under Operations → Troubleshoot → Debug Wizard:

- `sxp` → `sxp_appserver/sxp.log`
- `sgtbinding` → `sxp_appserver/sxp.log`
- `runtime-AAA` → `prrt-server.log`
- `nsf`, `nsf-session` → `ise-psc.log`

Bearing in mind the fifteen-minute limit on `runtime-AAA` at debug level.

## A pragmatic adoption path

TrustSec fails when deployed as a big-bang project across a heterogeneous estate. It works when introduced incrementally.

**Start with classification only.** Assign SGTs in authorisation policy and enforce nothing. You get visibility into what tag each endpoint would receive, with no risk.

**Add a small matrix.** Two or three tags, one or two enforcement rules, in one area. Something like "Contractor cannot reach Finance" — narrow, testable, and valuable on its own.

**Expand where the hardware supports it.** Use SXP to bridge the parts that don't, and factor inline tagging capability into hardware refresh decisions rather than driving a refresh for it.

**Keep the tag count low.** Fewer, broader roles are easier to reason about and easier to audit. A matrix nobody can read is not a control.

---

TrustSec is one of those technologies whose value is obvious in a diagram and whose difficulty is entirely in the propagation layer. Get classification right first — it's free, it's reversible, and the visibility alone is worth having before you enforce anything.
