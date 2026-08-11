---
title: "Cisco ISE Architecture: Personas, Deployment Models and Sizing Explained"
excerpt: "What each ISE persona actually does, how the small/medium/large deployment models are bounded, and the eleven design questions worth answering before you rack anything."
date: "2025-10-02"
tags: ["Cisco ISE", "Architecture", "Design", "NAC"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **PAN** | Policy Administration Node. Single point of configuration. All config changes happen here and replicate out. Max 2 (primary + secondary). |
| **MnT** | Monitoring node. Logging, reporting, Live Logs. Max 2. Heaviest disk requirement. |
| **PSN** | Policy Service Node. Does the actual RADIUS work. Scale these out. |
| **pxGrid** | Publishes context to other products (FMC, DNAC, StealthWatch). Max 4. |
| **Small** | Standalone or two nodes, all personas on each. |
| **Medium** | Max 8 nodes. 2×(PAN/MnT/pxGrid) + 6×PSN. |
| **Large** | Max 58 nodes. 2×PAN + 2×MnT + 50×PSN + 4×pxGrid. |
| **Failure to plan for** | PAN down = no config changes, authentication continues. MnT down = no logging, authentication continues. All PSNs down = no authentication. |
| **Licensing unit** | UDI = Product ID (PID) + Version ID (VID) + Serial Number (SN). |

---

Most ISE deployments that go wrong were designed wrong, not configured wrong. Configuration mistakes surface in a week and get fixed. Architecture mistakes surface in year two, when you're at 40,000 endpoints and discover the deployment model you picked caps out at eight nodes.

This covers what each persona does, what the deployment models actually bound, and the design questions worth arguing about before hardware arrives.

## The four personas

ISE is one software image. What differs is which **personas** you enable on a given node. A persona is a role, not a product.

### Policy Administration Node (PAN)

The single source of configuration truth. Every policy edit, every network device you add, every certificate you import happens on the primary PAN and replicates outward to every other node.

You can have two: primary and secondary. The secondary is a warm standby — it holds a synchronised copy but does not accept configuration changes until promoted.

**What happens when it goes down:** authentication continues completely unaffected. PSNs hold their policy locally and keep answering RADIUS. What you lose is the ability to *change* anything, and endpoint context updates stop propagating. This is the persona people over-engineer for; it is genuinely the least urgent to recover.

### Monitoring Node (MnT)

Collects logs from every other node and serves Live Logs, reports and alarms. Also max two, in a primary/secondary pair — and unlike the PAN, both are active, receiving logs simultaneously.

**Disk is the constraint here.** MnT holds your entire authentication history. On a large estate that is millions of records a day, and it is the node most likely to run out of space at 3am.

**What happens when it goes down:** authentication continues. You lose visibility, which is painful precisely when you need it — an MnT failure during an incident is a bad day, because now you're troubleshooting blind.

### Policy Service Node (PSN)

The one that does the work. PSNs terminate RADIUS, evaluate policy, talk to identity stores, run profiling and serve portals. This is the persona you scale horizontally.

**What happens when it goes down:** whatever it was serving stops authenticating, unless your network devices have another PSN configured as a fallback. This is why RADIUS server groups on your switches and WLCs matter more than most people treat them.

Two design patterns for PSN distribution:

**Centralised** — all PSNs in the data centre, branches authenticate across the WAN. Simpler, cheaper, and entirely dependent on WAN availability.

**Distributed** — PSNs at major sites. Survives WAN failure locally, but you now have more nodes to patch, more certificates to manage, and replication traffic to size.

### pxGrid Node

Publishes ISE's session context to other products. Firepower Management Center learns which user is behind an IP address. DNA Center learns endpoint identity. StealthWatch enriches flow data with usernames.

Max four. Frequently co-located with pxGrid/SXP duties in medium deployments.

## The deployment models, and what actually bounds them

Cisco's models are node-count ceilings, and picking one is a decision about your five-year ceiling, not today's endpoint count.

**Small** — standalone, or two nodes each running all personas. Fine for a lab, a single site, or a proof of concept. There is no meaningful redundancy in a true standalone.

**Medium — maximum 8 nodes.** Two common layouts:

- 2 × (PAN/MnT/pxGrid combined) + 6 × PSN
- 2 × (PAN/MnT) + 4 × PSN + 2 × (pxGrid/SXP)

The second is better if you're doing serious TrustSec or ecosystem integration, because SXP peering is genuinely resource-hungry and you don't want it competing with your administration node.

**Large — maximum 58 nodes.** 2 × PAN + 2 × MnT + 50 × PSN + 4 × pxGrid. Dedicated personas throughout. This is what a multinational enterprise runs.

The jump from medium to large is not a licence change you make on a Tuesday. It's a redeployment. Which is why the sizing conversation belongs at design time, with a five-year endpoint projection, not a current headcount.

## Eleven questions to answer before you build

This list is the actual value of a design review. Anyone can draw the boxes; these are what separate a deployment that survives from one that doesn't.

**1. Which deployment model, and why?** With the endpoint projection that justifies it.

**2. What is the bandwidth between personas?** Replication and logging traffic is not free. Cisco publishes minimums per persona pair — check them against your actual WAN, not your intended WAN.

**3. What is the sizing?** Endpoints, concurrent sessions, authentications per second at peak. Peak is what matters — Monday 09:00 when an entire campus badges in simultaneously.

**4. Virtual or physical?** VMs are flexible and almost always the right answer now. But they must meet the reserved CPU, memory and disk specification. An under-resourced ISE VM produces intermittent, maddening failures that look like network problems.

**5. Where does AD sit relative to the PSNs?** Every authentication that hits AD crosses whatever is between them. A PSN in Singapore authenticating against a domain controller in Frankfurt will work, and it will be slow enough that supplicants time out.

**6. WAN down, ISE unreachable — what happens?** This is the question that produces Critical Auth VLAN and Critical MAB design. If the honest answer is "everyone at that site loses network access", you have a design problem, not an operational one.

**7. An entire site goes down — what happens?** Different question from the above. Now consider whether you've inadvertently made one site a dependency for others.

**8. Primary PAN goes down — what happens?** Answer: authentication is fine, configuration is frozen. Now decide whether you want automatic PAN failover, and understand it brings its own complexity.

**9. MnT goes down — what happens?** Answer: you lose visibility. Decide whether you're comfortable with the second MnT carrying it, and whether its disk can take the volume.

**10. One PSN goes down — what happens?** Answer depends entirely on your RADIUS server group configuration on the network devices. If switches only know about one PSN, you've built a single point of failure into the access layer.

**11. When the secondary takes over, is the service level acceptable?** Including latency. A secondary that technically works but adds 400ms to every authentication is not a functioning secondary.

## Licensing, briefly

ISE licensing is tied to **Unique Device Identifiers (UDIs)**, made up of three parts:

- **Product identifier (PID)**
- **Version identifier (VID)**
- **Serial number (SN)**

Separate licence types exist for Device Administration (TACACS+) and for Virtual Machine instances. The practical implication: keep a record of the UDI for every node at build time. Retrieving it later from a node that won't boot is a bad afternoon.

## The design mistakes I see repeatedly

**Sizing to today.** The deployment is designed for the current endpoint count with no growth headroom, and hits the medium-model ceiling in year two.

**Treating all personas as equally critical.** Effort gets spent on PAN redundancy while a single PSN quietly serves an entire region.

**Ignoring the identity store path.** ISE is designed and sized carefully, then pointed at a domain controller across a saturated WAN link.

**No answer to "WAN down".** Critical Auth VLAN and Critical MAB exist for exactly this, and they need designing in, not bolting on after the first outage.

**MnT disk sized for average, not peak.** Then a broadcast storm generates ten times the normal authentication volume and fills the disk during the incident you most need logs for.

---

Architecture decisions in ISE are expensive to reverse because they're bound up with certificates, network device configuration and licensing. The questions above take an afternoon to work through properly, and that afternoon is the cheapest insurance available.
