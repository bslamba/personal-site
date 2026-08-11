---
title: "Azure Resource Hierarchy: Management Groups, Subscriptions and Resource Groups"
excerpt: "How Azure organises everything you deploy, why the hierarchy is really about inheritance, the limits that constrain your design, and where Azure Resource Manager and Azure Arc fit in."
date: "2026-05-21"
tags: ["Azure", "Cloud", "Governance", "Architecture", "Cost Management"]
draft: false
---

## Cheat sheet

| Level | What it is |
|---|---|
| **Management group** | Governance scope **above** subscriptions. Policy and RBAC cascade down by inheritance. |
| **Subscription** | Unit of **billing, scale and quota**. A boundary for cost, governance, security and identity. |
| **Resource group** | Logical container for resources. A resource can only be in **one** resource group. |
| **Resource** | The actual thing — VM, storage account, database, virtual network. |

| Limit | Value |
|---|---|
| Management groups per directory | **10,000** |
| Management group tree depth | **Six levels** (excluding root and subscription level) |
| Parent management groups | Each management group and subscription supports **only one parent** |
| Root management group | Every directory has one; all others descend from it |

**Azure Resource Manager (ARM)** is the deployment and management layer every request passes through — portal, CLI, PowerShell, SDK, REST.

---

Every Azure deployment sits somewhere in a four-level hierarchy. Understanding it is less about knowing the names than about understanding one thing: **inheritance flows downward, and it's the reason the hierarchy exists at all.**

![Azure management hierarchy from management groups down to resources](/blog-images/azure/azure-resource-hierarchy.svg)

## Resources

The bottom, and the concrete part. A resource is anything you create: a virtual machine, a storage account, a SQL database, a virtual network, a public IP address.

Every resource lives in exactly one resource group and one region.

## Resource groups

A logical container for resources.

**The rules worth knowing:**

- A resource can belong to **only one resource group** at a time
- A resource group can contain resources from **different regions** — the group itself has a location, which is only where its metadata is stored
- Resource groups **cannot be nested**
- Deleting a resource group **deletes everything in it**

That last one is a footgun and a feature simultaneously. It makes tearing down a test environment trivial, and it makes an accidental deletion catastrophic. It's the single strongest argument for resource locks on anything production.

**How to group things.** The useful heuristic is **shared lifecycle**. Resources that are created together, deployed together and destroyed together belong in the same group. An application's web app, its database and its storage account share a lifecycle. Your hub virtual network does not — it outlives every application attached to it.

Grouping by department or by resource type feels tidy and produces groups you can never safely delete.

## Subscriptions

A subscription is the **unit of management, billing and scale**.

It serves as a boundary for **scale, quota, cost, governance, security and identity controls** for the resources contained in it. Every resource group belongs to exactly one subscription.

**Two boundaries it provides:**

**A billing boundary.** Costs are reported and invoiced per subscription. If you need separate invoices, you need separate subscriptions.

**An access-control boundary.** Azure applies access management at the subscription level, so you can separate teams and environments by putting them in different subscriptions.

**You might create additional subscriptions to separate:**

- **Environments** — production from development and test, so a runaway test workload can't consume production quota
- **Organisational structures** — different departments with different budgets and different access
- **Billing** — where costs must be reported separately for internal chargeback

**Quotas are per subscription**, which is a genuine architectural constraint rather than a formality. Hit the vCPU limit in a subscription and deployments start failing, regardless of how much you're willing to pay.

## Management groups

The layer above subscriptions, and the one that makes governance at scale possible.

**Management groups provide a governance scope above subscriptions.** When you organise subscriptions into management groups, the governance conditions you apply **cascade by inheritance to all associated subscriptions**.

So instead of applying a policy to forty subscriptions individually, you apply it once at a management group and every subscription beneath it inherits it.

**Examples of how you could use management groups:**

- **Apply policy at scale.** Restrict which regions resources may be created in, across every subscription in a group.
- **Provide user access to multiple subscriptions.** Assign an RBAC role once at the management group and it applies to every subscription within it, letting you manage far fewer role assignments.

### The facts that constrain your design

- **10,000 management groups** are supported in a single directory
- A management group tree can support **up to six levels of depth**, not including the root level or the subscription level
- Each management group and subscription supports **only one parent**
- Each directory has a **single top-level root management group**, and all others descend from it

Six levels sounds generous and is easy to waste. A common workable structure is: root → environment type → business unit → workload. That's four, leaving room.

**Design advice:** build the hierarchy around what you want to govern differently, not around your org chart. Org charts change; the distinction between production and non-production doesn't.

## Azure Resource Manager

Everything above is organised by **Azure Resource Manager** — the deployment and management service for Azure. It's the layer every request goes through, whether it comes from the portal, Azure CLI, PowerShell, an SDK, or the REST API.

That single entry point is why the experience is consistent regardless of tool.

**With Azure Resource Manager, you can:**

- Manage your infrastructure through **declarative templates rather than scripts**
- Deploy, manage and monitor all the resources for a solution **as a group**, rather than individually
- **Redeploy consistently** throughout the development lifecycle, with confidence that resources are deployed in a consistent state
- Define the **dependencies between resources** so they're deployed in the correct order
- Apply **access control to all services**, because RBAC is natively integrated
- Apply **tags** to organise and identify resources
- **Clarify billing** by viewing costs for a group of resources sharing the same tag

### ARM templates

**Azure Resource Manager templates provide several key benefits:**

**Declarative syntax.** You describe what you want; ARM works out how to build it. You don't write the sequence.

**Repeatable results.** Deploy the same template repeatedly and get the same environment. Templates are **idempotent** — deploying an existing environment produces the same end state rather than duplicates.

**Orchestration.** ARM orders operations and parallelises where it can. Deploying via a template is generally faster than deploying resources one at a time with a script.

**Modular files.** Templates can be broken into components and reused.

**Extensibility.** Deployment scripts can be added to templates for steps ARM doesn't cover natively.

**Built-in validation.** A template is validated before anything is deployed, so a malformed deployment fails before it creates a half-built environment.

That validation step is the practical argument for templates over portal clicking. A script that fails halfway leaves you with an inconsistent environment to clean up manually; a template that fails validation leaves you with nothing changed.

## Azure Arc

A related concept worth understanding alongside the hierarchy, because it extends it.

**Azure Arc provides a centralized, unified way to:**

- Manage your **entire environment together** — Azure resources, on-premises servers, and resources in other clouds — by projecting them into Azure Resource Manager
- Manage **virtual machines, Kubernetes clusters and databases** as if they were running in Azure
- Use **familiar Azure services and management capabilities** regardless of where those resources live
- Continue using **traditional ITOps** while introducing DevOps practices to support new cloud-native patterns
- **Configure custom locations** as an abstraction layer on top of Kubernetes clusters and cluster extensions

The point of Arc is that governance you've built in Azure — policy, RBAC, tagging, monitoring — stops being Azure-only. A server in your own datacenter can be projected into ARM and subjected to the same Azure Policy as a VM in a region.

For anyone running a genuinely hybrid estate, that consistency is the interesting part. One governance model rather than two.

## Putting it together

A structure that works for most organisations:

**Root management group** — organisation-wide policy that should never be violated anywhere. Allowed regions, mandatory tags, denied resource types.

**Platform / Landing Zones / Sandbox** at the second level — different governance expectations for shared infrastructure, application workloads, and experimentation.

**Production / Non-production** beneath Landing Zones — different policy strictness.

**Subscriptions per workload or per team**, giving each a billing boundary and its own quota.

**Resource groups per lifecycle** within those subscriptions.

Start simpler than you think you need. Adding a management group level later is straightforward; unpicking a hierarchy that mirrors an org chart from three reorganisations ago is not.

---

**References**

- [Organize your resources with management groups — Microsoft Learn](https://learn.microsoft.com/en-us/azure/governance/management-groups/overview)
- [Subscription considerations and recommendations — Cloud Adoption Framework](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-area/resource-org-subscriptions)
- [Resource organization design area — Cloud Adoption Framework](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ready/landing-zone/design-area/resource-org)
- [Azure Resource Manager overview — Microsoft Learn](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/overview)
