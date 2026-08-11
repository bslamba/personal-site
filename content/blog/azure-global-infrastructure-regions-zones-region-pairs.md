---
title: "Azure Global Infrastructure: Regions, Availability Zones and Region Pairs"
excerpt: "How Azure's physical footprint is actually organised, what an availability zone genuinely protects against, why many newer regions have no pair at all, and how to choose where to deploy."
date: "2026-05-14"
tags: ["Azure", "Cloud", "Architecture", "Reliability", "Governance"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Geography** | A **data residency boundary**. Usually a country or region of the world. Contains one or more Azure regions. |
| **Region** | A set of datacenters within a latency-defined perimeter, connected by a dedicated low-latency network. Azure has **over 70**. |
| **Availability zone** | Independent sets of datacenters within a region, each with **isolated power, cooling and networking**. Close enough for low latency, far enough apart to fail independently. |
| **Region pair** | Two regions, usually in the same geography, used by some services for geo-replication and geo-redundancy. |
| **Important** | **Many regions aren't paired.** Many newer regions provide multiple availability zones and have no pair at all. |
| **Sovereign region** | Physically and logically isolated instances of Azure — US Government, China. |
| **Choosing a region** | Data residency · Latency to users · Service availability · Price · Compliance |

---

"Deploy it to Azure" is not an architecture decision. "Deploy it to West Europe across three availability zones with geo-redundant storage" is. Understanding the physical hierarchy is what turns one into the other.

![Geography, region, availability zone and region pair relationship](/blog-images/azure/azure-regions-zones-pairs.svg)

## Geographies

A geography is a **data residency and compliance boundary**. It typically maps to a country or a defined area of the world, and it exists so organisations with data sovereignty requirements can guarantee their data stays within specific legal borders.

Each geography contains one or more regions and is fault-tolerant to the failure of an entire region.

This is the layer that matters for regulators. If your obligation is "customer data must remain within the European Union", geography is the concept that satisfies it.

## Regions

A region is a set of datacenters deployed within a latency-defined perimeter and connected through a dedicated low-latency network.

**Azure provides over 70 regions globally** — more than any other cloud provider — with regions located across many different geographies.

Practically, a region is your primary unit of deployment. You choose a region, and resources live in it.

**What varies by region:**

- **Service availability.** Not every Azure service exists in every region. New services roll out to major regions first.
- **Price.** The same VM costs differently in different regions.
- **Latency.** To your users, and to your on-premises estate.
- **Compliance.** What certifications the region holds.

Check service availability before committing to a region. Discovering that the service your architecture depends on isn't available where you deployed is a genuinely annoying way to spend a Tuesday.

## Availability zones

This is the concept that does the most work in a resilient design.

**Availability zones are physically separate datacenters within an Azure region.** Each zone is made up of one or more datacenters equipped with **independent power, cooling and networking**.

The design intent is a deliberate balance: zones are **physically close enough together to provide low-latency networking** between them, and **far enough apart to provide fault isolation** — so a power event, a cooling failure or a flood affecting one zone doesn't affect the others.

**What a zone protects against:** datacenter-level failure. Power, cooling, network, and physical events within one building or campus.

**What a zone does not protect against:** a regional event, a bad configuration change you deploy to all zones simultaneously, or a service-wide outage.

### Zonal versus zone-redundant

Worth being precise, because the distinction determines whether your design actually survives anything.

**Zonal services** are pinned to a specific zone. You place a VM in Zone 1. If Zone 1 fails, that VM fails. Resilience requires *you* to deploy instances across several zones and put something in front of them.

**Zone-redundant services** replicate across zones automatically. The service handles it; you get resilience without designing for it.

A VM is zonal. Zone-redundant storage is zone-redundant. Deploying a single VM into a zone and believing you have zone resilience is one of the more common misunderstandings in Azure design.

## Region pairs

Microsoft associates some Azure regions with another region — usually within the same geography — and together these form a **region pair**.

**What they're for:** a small number of Azure services use region pairs to support **geo-replication and geo-redundancy**, and the pairs also support some aspects of disaster recovery.

**Additional advantages of region pairs:**

- In a broad outage, **at least one region in each pair is prioritised for recovery**
- **Planned Azure updates are rolled out to paired regions one at a time**, so an update problem doesn't take out both
- Data continues to **reside within the same geography** for tax and legal jurisdiction purposes, except where a geography has only one region

### The part most notes get wrong

Here is the current position, and it differs from what a lot of older material says:

**Many regions aren't paired.** Instead they use **availability zones as their primary means of redundancy**. Many of the newer regions provide multiple availability zones and **do not have a region pair at all**.

So the mental model has shifted. Region pairing was the original answer to regional resilience; availability zones are increasingly the primary answer, with pairing applying to a subset of regions and a subset of services.

**The practical instruction:** do not assume your region has a pair. Check. And do not assume a service uses the pair even if one exists — only some services do.

## Sovereign regions

Physically and logically isolated instances of Azure, separate from the main Azure cloud.

**Azure sovereign regions include:**

- **Azure Government** — for US government agencies and partners, operated by screened US personnel, with additional compliance certifications
- **Azure China** — operated through a partnership with 21Vianet, as Microsoft does not directly maintain the datacenters

These are genuinely separate clouds. Different endpoints, different service availability, different management portals. Code and templates written against commercial Azure frequently need changes to run in them.

## Datacenters

Beneath everything sits the physical layer: buildings full of racks, with power, cooling and network. Azure operates a very large number of them.

You never interact with a datacenter directly — it's abstracted behind zones and regions. It matters conceptually because it's what an availability zone is actually made of, and it's the layer where the provider's responsibility in the shared responsibility model is absolute.

## Choosing where to deploy

Five questions, in roughly this order:

**1. Where must the data legally live?** Geography first. This constraint is usually non-negotiable and rules out most options immediately.

**2. Where are the users?** Latency is a function of distance. A service in West Europe serving users in Singapore will feel slow no matter how well it's built.

**3. Is every service I need available there?** Check the service availability list before designing, not after.

**4. Does the region have availability zones?** If your resilience target requires surviving a datacenter failure, you need zones. Not every region has them.

**5. What does it cost?** Prices vary meaningfully. Where the first four answers permit a choice, this one breaks the tie.

## A resilience ladder

Worth having a shared vocabulary with whoever is signing off the design:

| Level | What it survives | How |
|---|---|---|
| Single instance | Nothing beyond a VM restart | One VM, one zone |
| Availability set | Rack and update-domain failure within a datacenter | Multiple VMs, fault and update domains |
| Availability zones | Datacenter-level failure | Instances across two or more zones |
| Multi-region | Regional failure | Deployment in a second region, with a plan for data |
| Multi-geography | Geography-level events, and residency needs | Separate deployments per geography |

Each step costs real money and real complexity. The correct level is a business decision about acceptable downtime, not a technical default — and it's worth writing down what the chosen level *doesn't* protect against, because that's the sentence people remember during an incident.

---

**References**

- [What are Azure regions? — Microsoft Learn](https://learn.microsoft.com/en-us/azure/reliability/regions-overview)
- [What are Azure availability zones? — Microsoft Learn](https://learn.microsoft.com/en-us/azure/reliability/availability-zones-overview)
- [Azure region pairs and nonpaired regions — Microsoft Learn](https://learn.microsoft.com/en-us/azure/reliability/regions-paired)
- [List of Azure regions — Microsoft Learn](https://learn.microsoft.com/en-us/azure/reliability/regions-list)
