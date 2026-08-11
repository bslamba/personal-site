---
title: "The Shared Responsibility Model and Cloud Service Models Explained"
excerpt: "Who is responsible for what in IaaS, PaaS and SaaS — with the full matrix — plus the consumption-based pricing model, CapEx versus OpEx, and where each service model actually fits."
date: "2026-05-07"
tags: ["Azure", "Cloud", "Cloud Security", "Fundamentals", "Governance"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Always yours, in every model** | Information and data · Devices · Accounts and identities |
| **Always the provider's** | Physical datacenter · Physical network · Physical hosts |
| **It depends on the model** | Operating system · Network controls · Applications · Identity infrastructure |
| **IaaS** | Most control, most responsibility. You rent infrastructure. |
| **PaaS** | Middle ground. Provider runs the platform; you own the app and data. |
| **SaaS** | Least control, least responsibility. You configure and use. |
| **CapEx** | Up-front capital spend on hardware. Depreciates. |
| **OpEx** | Ongoing operational spend. Pay for what you consume. |
| **Consumption model** | No up-front cost · No over-provisioning · Pay for more as you need it · Stop paying when you stop using |

---

Everything in cloud security starts with one question: which parts are yours to secure, and which belong to the provider?

Get that wrong and you either duplicate work the provider already does, or — far worse — assume something is covered when it isn't. The overwhelming majority of cloud breaches are not provider failures. They are customer misconfigurations in areas the customer was always responsible for.

## The shared responsibility model

![Shared responsibility across on-premises, IaaS, PaaS and SaaS](/blog-images/azure/shared-responsibility-model.svg)

Read that matrix top to bottom and the pattern becomes clear.

**Three things are always yours**, no matter which model you choose:

- **Information and data** — the provider stores it; you decide what it is, who reaches it, and how it's classified
- **Devices** — the laptops and phones your people use
- **Accounts and identities** — every user, every service principal, every credential

**Three things are always the provider's:**

- **Physical datacenters**
- **Physical network**
- **Physical hosts**

**Everything in between shifts with the service model**, and that shifting middle is where the real design decisions live.

### Why the always-yours rows matter most

Look at what stays with you regardless: data, devices, identities. Those are precisely the three things attackers target.

Nobody compromises a cloud tenant by breaking into a Microsoft datacenter. They compromise it through a phished credential, an over-permissioned service principal, a storage container left open to the internet, or an unmanaged laptop.

The provider has made the bottom of that matrix somebody else's problem. It has not made security somebody else's problem — it has concentrated your responsibility onto exactly the layers where mistakes are most damaging.

## The three service models

### Infrastructure as a Service

You rent the infrastructure — virtual machines, storage, networking — and everything above the hypervisor is yours. Operating system, patching, runtime, application, data.

**Maximum control, maximum responsibility.**

**Where it fits:**

- **Lift-and-shift migrations.** Moving existing workloads without rewriting them.
- **Testing and development.** Environments you create and destroy quickly.
- **Specific OS or runtime requirements** that a managed platform won't accommodate.
- **Legacy applications** that assume a full server.

The trap with IaaS is that it feels familiar — it looks like the datacenter you already run. That familiarity means teams often carry across the same manual patching, the same snowflake servers and the same operational habits, and end up paying cloud prices for datacenter practices.

### Platform as a Service

The provider manages the operating system, runtime, middleware and infrastructure. You bring the application and the data.

**Responsibility focus in PaaS:** your code, your data, your configuration, and your identities. Patching the OS underneath is not your problem.

**Where it fits:**

- **Development frameworks** where you want to write code, not maintain servers
- **Analytics and business intelligence** on managed services
- Anywhere the operational overhead of running the platform yourself adds no value

PaaS is usually the right default for anything new. The question worth asking is not "can we run this ourselves" but "does running it ourselves produce anything a customer would pay for". Usually it doesn't.

### Software as a Service

You get finished software. The provider runs everything; you configure it and use it.

**Responsibility focus in SaaS:** your data, your devices, your accounts and identities. That's the list.

**Where it fits:**

- **Email and messaging**
- **Collaboration and productivity**
- **Finance and expense tracking**
- **CRM and line-of-business applications**

The residual risk in SaaS is almost entirely identity and data governance. Who has access, what they can export, and what happens when they leave.

### Side by side

<div class="fancy-table">

<table>
<thead>
<tr><th>Layer</th><th>On-premises</th><th>IaaS</th><th>PaaS</th><th>SaaS</th></tr>
</thead>
<tbody>
<tr><td>Data and information</td><td>You</td><td>You</td><td>You</td><td>You</td></tr>
<tr><td>Accounts and identities</td><td>You</td><td>You</td><td>You</td><td>You</td></tr>
<tr><td>Devices</td><td>You</td><td>You</td><td>You</td><td>You</td></tr>
<tr><td>Identity infrastructure</td><td>You</td><td><span class="pill-warn">Shared</span></td><td><span class="pill-warn">Shared</span></td><td><span class="pill-warn">Shared</span></td></tr>
<tr><td>Applications</td><td>You</td><td>You</td><td><span class="pill-warn">Shared</span></td><td>Provider</td></tr>
<tr><td>Network controls</td><td>You</td><td>You</td><td><span class="pill-warn">Shared</span></td><td>Provider</td></tr>
<tr><td>Operating system</td><td>You</td><td>You</td><td>Provider</td><td>Provider</td></tr>
<tr><td>Physical infrastructure</td><td>You</td><td>Provider</td><td>Provider</td><td>Provider</td></tr>
</tbody>
</table>

</div>

## The consumption-based model

Traditional infrastructure is **capital expenditure (CapEx)** — a large up-front purchase of hardware that depreciates over years. You buy for peak demand, then run at a fraction of it for most of the hardware's life.

Cloud is **operational expenditure (OpEx)** — an ongoing cost tied to what you actually use.

**The consumption-based model offers several key benefits:**

- **No up-front capital cost.** You don't buy servers before you know whether the project succeeds.
- **No need to purchase and manage costly infrastructure** that may end up underused.
- **You can pay for more resources when you need them**, and stop when you don't.
- **You stop paying for resources you're no longer using.**

That last point is the one organisations most often fail to realise. The cloud only stops charging when you actually turn something off — and a development VM left running over a weekend costs the same as a production one.

### What actually drives cost

Several factors affect what you pay in Azure:

**Resource type.** A premium SSD costs differently from standard. A GPU VM costs differently from a general-purpose one.

**Consumption.** Pay-as-you-go versus reserved capacity. A SQL Server VM running 24/7 for years is a perfect candidate for a reservation, and paying list price for it is money left on the table.

**Location.** The same resource costs different amounts in different regions, reflecting local energy, labour and property costs.

**Bandwidth.** Inbound data transfer is generally free. Outbound is not, and egress charges are the line item that most often surprises people.

## Where the elasticity actually helps

The consumption model isn't only about cost — it changes what's possible.

**Scale on demand.** A retailer sizing for Black Friday traditionally buys hardware that sits idle for eleven months. In cloud, that capacity exists for the weeks it's needed.

**Fail cheaply.** A project that would have required a hardware purchase to test can now be tried for the price of a few days of compute.

**Update at scale.** As standards change, you can update resources at scale rather than touching machines individually — which is the argument for infrastructure as code rather than clicking through a portal.

## A practical position

The shared responsibility model is often presented as a diagram to memorise. It's more useful as a checklist to argue about.

For any workload you're moving, work down the matrix and name the person or team responsible for each row. The rows where nobody can be named are your actual risk. In my experience that's usually identity infrastructure in PaaS deployments, and network controls in anything lifted-and-shifted — both sit in the shared band, and "shared" is where things fall between two teams.

The provider will hold up its end. The interesting question is always whether you're holding up yours.

---

**References**

- [Shared responsibility in the cloud — Microsoft Learn](https://learn.microsoft.com/en-us/azure/security/fundamentals/shared-responsibility)
- [Describe cloud service types — Microsoft Learn](https://learn.microsoft.com/en-us/training/modules/describe-cloud-service-types/)
- [Azure pricing overview](https://azure.microsoft.com/en-us/pricing/)
