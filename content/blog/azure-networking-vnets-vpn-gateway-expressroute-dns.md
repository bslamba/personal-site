---
title: "Azure Networking: VNets, VPN Gateway, ExpressRoute and Azure DNS"
excerpt: "Why route-based VPN gateways are effectively mandatory, how policy-based gateways actually work and where they fail, the high-availability options, and when ExpressRoute is genuinely worth it."
date: "2026-06-04"
tags: ["Azure", "Cloud", "Virtual Network", "Networking", "VPN"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Virtual network** | Your isolated network in Azure. Segmented into subnets. |
| **Policy-based VPN** | Legacy. Matches traffic against a fixed access list. **One tunnel. IKEv1 only. Basic SKU only.** |
| **Route-based VPN** | Modern standard. Treats the tunnel as a **virtual interface (VTI)** and uses the routing table. Required for almost everything useful. |
| **Route-based is required for** | VNet-to-VNet · Point-to-site · Multi-site · ExpressRoute coexistence · Active-active HA |
| **ExpressRoute** | Private connection to Microsoft, **not over the public internet**. Higher reliability, faster, lower latency. |
| **Azure DNS** | Hosts DNS domains on Azure's global anycast infrastructure. |
| **Alias records** | Point a DNS record at an Azure resource, so it updates automatically when the resource IP changes. |

---

Azure networking has one decision that determines whether the rest of your design is possible, and it gets made early: policy-based or route-based VPN gateway. Choose wrong and you discover the limitation months later when you try to add a second connection.

## Virtual networks

A virtual network is your logically isolated network in Azure. You define the address space, carve it into subnets, and control traffic between them.

**What it gives you:**

- **Isolation and segmentation** — multiple VNets, each with its own address space, subdivided into subnets
- **Internet communication** — resources reach the internet by default; inbound requires a public IP or a load balancer
- **Communication between Azure resources** — VNets, and service endpoints connecting to storage accounts and SQL databases
- **Communication with on-premises** — via VPN or ExpressRoute
- **Traffic filtering** — network security groups and network virtual appliances
- **Routing** — route tables and BGP to override Azure's default routing

**VNet peering** connects two virtual networks directly, using Microsoft's backbone rather than the public internet. Low latency, high bandwidth, and it works across regions.

## Virtual Private Network

A VPN uses an encrypted tunnel across an untrusted network — usually the public internet — to connect two networks securely.

In Azure, a **VPN gateway** is deployed into a dedicated subnet of a virtual network and enables:

- **Site-to-site** — connect an on-premises datacenter to a VNet
- **Point-to-site** — connect individual devices to a VNet
- **VNet-to-VNet** — connect VNets to each other

## Policy-based versus route-based

This is the decision that matters.

![Policy-based versus route-based VPN gateway comparison](/blog-images/azure/vpn-policy-vs-route-based.svg)

### Policy-based gateways — the legacy approach

Policy-based VPNs, historically called **static routing VPNs**, rely on a strictly defined set of rules — an access list of source and destination address prefixes.

**How it works:** when a packet arrives, the gateway compares its source and destination against that list. If the pair matches an entry, the packet is encrypted and sent down the tunnel. If it doesn't match, it isn't.

**What that costs you:**

- **One tunnel only.** The policy defines a single pairing.
- **IKEv1 only.**
- **Basic SKU only**, which caps throughput and rules out the features on higher SKUs.
- **No VNet-to-VNet, no point-to-site, no coexistence with ExpressRoute.**
- Every subnet pairing must be defined explicitly, so the configuration grows unmanageably as the estate grows.

### Route-based gateways — the modern standard

Route-based VPNs operate at a higher level of abstraction by **treating the IPSec tunnel as a literal virtual network interface (VTI)**.

**How it works:** instead of examining the packet's source and destination to decide whether to encrypt it, the gateway uses **standard IP routing tables**. If the routing table says "to reach network X, use this interface", and that interface is the tunnel, the traffic goes down the tunnel and is encrypted as a consequence.

That inversion is the whole point. Encryption becomes a property of the route rather than a decision made per packet against a static list — which means everything routing can do, the VPN can now do.

### Why route-based is required for specific connectivity

**Connections between virtual networks (VNet-to-VNet).** When connecting multiple VNets across regions, topologies grow complex. Route-based gateways let Azure **dynamically route traffic across multiple paths** and safely handle overlapping multi-tunnel architectures without manually mapping every subnet pair.

**Point-to-site.** Individual clients connect from arbitrary addresses. A policy-based gateway has no way to express "any client, from anywhere" as a fixed source/destination pair.

**Multi-site.** Several on-premises locations to one VNet means several tunnels — which a policy-based gateway cannot provide.

**ExpressRoute coexistence.** Running a VPN as backup for an ExpressRoute circuit requires a route-based gateway, because the decision of which path to use is a routing decision. **A policy-based gateway cannot participate in this dynamic path-switching.**

**Active-active high availability.** Requires multiple simultaneous tunnels.

**The practical rule:** unless you're connecting to a legacy device that genuinely only supports policy-based IPsec, choose route-based. The cost of choosing policy-based is not performance — it's that the architecture becomes a dead end.

## High availability for VPNs

If you're building a VPN to keep information safe, you also want it fault tolerant. Several ways to maximise resilience:

**Active/standby.** Every VPN gateway is built from two instances by default, in active/standby. Planned maintenance or an unplanned failure causes automatic failover — typically a few seconds for planned events, up to a minute or two for unplanned. Sessions are dropped and must reconnect, but the tunnel returns without intervention.

**Active/active.** With BGP, both gateway instances run simultaneously, each with a unique public IP. Create tunnels from your on-premises device to both, and traffic uses both paths.

**ExpressRoute failover.** Configure a site-to-site VPN as a backup path for an ExpressRoute circuit — protection against a circuit outage. This is one of the configurations that requires a route-based gateway.

**Zone-redundant gateways.** In regions with availability zones, deploy the gateway across zones so a datacenter-level failure doesn't take the connection down.

## ExpressRoute

ExpressRoute provides a **private connection to Microsoft cloud services from your on-premises infrastructure**, through a connectivity provider. Crucially, connections **do not go over the public internet**.

**Connectivity can be from:**

- An **any-to-any (IPVPN) network**
- A **point-to-point Ethernet connection**
- A **virtual cross-connection** through a connectivity provider at a colocation facility

**What it gives you over VPN:**

- **Higher reliability**, with a service-level agreement
- **Faster speeds**, into the tens of gigabits
- **Consistent, lower latency**, because the path is predictable
- **Higher security**, since traffic never touches the public internet
- **Global connectivity** with ExpressRoute Global Reach, linking on-premises sites to each other via Microsoft's backbone
- **Dynamic routing via BGP**
- **Built-in redundancy** — every connectivity provider uses redundant devices

**At a high level, choose ExpressRoute when:**

- You need **predictable, consistent latency** rather than best-effort internet
- You're moving **large volumes of data** where internet bandwidth or egress becomes the constraint
- **Regulatory or security requirements** prohibit traffic traversing the public internet
- You need a **bandwidth guarantee** that an internet VPN cannot provide

The trade-off is cost and lead time. ExpressRoute involves a provider, a contract and a physical provisioning process measured in weeks. A VPN can be up in an afternoon.

**The common pattern:** ExpressRoute as the primary path with a site-to-site VPN as backup. You get the performance and the resilience, and the VPN costs little while idle.

## Azure DNS

A hosting service for DNS domains, running on Azure's infrastructure.

**Benefits of Azure DNS:**

**Reliability and performance.** DNS domains are hosted on Azure's global network of name servers using **anycast networking** — each DNS query is answered by the closest available server, giving fast performance and high availability.

**Security.** Built on Azure Resource Manager, which provides **role-based access control** to control who can manage DNS, **activity logs** to monitor changes, and **resource locking** to prevent accidental deletion of critical zones.

**Ease of use.** Manage DNS records with the same credentials, APIs, tools, billing and support as your other Azure services. Host domains in Azure and manage records with the same tooling you already use.

**Customisable virtual networks with private domains.** Azure DNS supports **private DNS domains**, letting you use custom names in your own virtual networks rather than Azure-provided names.

**Alias records.** Azure DNS supports alias record sets that point to an Azure resource — a public IP address, a Traffic Manager profile, a CDN endpoint. If the resource's IP changes, the alias record updates automatically. That eliminates a whole class of stale-DNS incidents where a resource was rebuilt and nobody updated the record.

**One thing Azure DNS does not do:** register domain names. You buy the domain from a registrar, then delegate the zone to Azure DNS by pointing the registrar's name server records at Azure's.

## A sequence for designing connectivity

1. **What must reach what?** Draw it before choosing technology.
2. **Does anything prohibit the public internet?** If yes, ExpressRoute becomes a requirement rather than an option.
3. **What's the bandwidth and latency requirement?** This decides VPN versus ExpressRoute more often than security does.
4. **How many sites, and will that grow?** More than one, or likely to be, means route-based without further discussion.
5. **What's the resilience target?** Active/active, zone-redundant, ExpressRoute with VPN backup — each is a step up in cost and complexity.
6. **How will names resolve?** Split-horizon DNS between on-premises and Azure is one of the more common sources of confusing failures, and it's worth designing deliberately rather than discovering.

---

**References**

- [Azure Virtual Network overview — Microsoft Learn](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-overview)
- [About VPN Gateway — Microsoft Learn](https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-about-vpngateways)
- [Policy-based and route-based VPN gateways — Microsoft Learn](https://learn.microsoft.com/en-us/azure/vpn-gateway/about-vpn-gateway-settings)
- [ExpressRoute overview — Microsoft Learn](https://learn.microsoft.com/en-us/azure/expressroute/expressroute-introduction)
- [Azure DNS overview — Microsoft Learn](https://learn.microsoft.com/en-us/azure/dns/dns-overview)
