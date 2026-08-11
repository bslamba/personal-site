---
title: "Azure Compute Compared: VMs, Containers, App Service and Functions"
excerpt: "Four ways to run code in Azure and how to choose between them — VM sizing and availability sets, when containers make sense, what App Service handles for you, and where serverless genuinely fits."
date: "2026-05-28"
tags: ["Azure", "Cloud", "Compute", "Architecture", "Containers"]
draft: false
---

## Cheat sheet

<div class="fancy-table">

<table>
<thead>
<tr><th>Option</th><th>You manage</th><th>Best for</th><th>Scaling</th></tr>
</thead>
<tbody>
<tr><td>Virtual Machines</td><td>OS, runtime, app, patching</td><td>Lift-and-shift, legacy apps, full control</td><td>Manual or scale sets</td></tr>
<tr><td>Containers</td><td>App and image</td><td>Microservices, portable workloads, consistent environments</td><td>Fast, per-container</td></tr>
<tr><td>App Service</td><td>App and configuration</td><td>Web apps, APIs, mobile backends</td><td>Built in, automatic</td></tr>
<tr><td>Functions</td><td>Code only</td><td>Event-driven, intermittent work</td><td>Automatic, to zero</td></tr>
</tbody>
</table>

</div>

| | |
|---|---|
| **VM size name** | e.g. **D2as_v5** — family, vCPU count, features, generation |
| **Availability set** | Groups VMs by **fault domains** (shared power and network) and **update domains** (rebooted together) |
| **Azure Virtual Desktop** | Desktop and app virtualisation in the cloud. Windows 10/11 **multi-session**. |
| **Functions billing** | Charged only while running. Scales to zero. |
| **App Service supports** | Windows and Linux · .NET, Java, Node.js, Python, PHP · Web Apps, API Apps, WebJobs, Mobile Apps |

---

The compute decision is really a question about how much of the stack you want to be responsible for. Everything else follows from that answer.

## Virtual machines

A VM is a software emulation of a physical computer. You get the operating system and everything above it, and you own all of it — patching, hardening, runtime, application.

**VMs are a good fit when you need:**

- **Total control over the operating system**
- To **run custom software** that won't run on a managed platform
- To use **custom hosting configurations**

**Common VM use cases include:**

- **During testing and development.** VMs are a quick, flexible way to create different OS and application configurations, then delete them when finished.
- **When running applications in the cloud.** The ability to run certain applications in the cloud instead of on-premises can deliver real economic benefits from elastic scale.
- **When extending your datacenter to the cloud.** Extend an on-premises network into Azure with a virtual network, and add VMs to run applications as though they were local.
- **During disaster recovery.** IaaS-based recovery is materially cheaper than maintaining a duplicate physical datacenter that sits idle.

**Lift and shift** is the classic migration pattern: move an existing on-premises server into Azure essentially as-is. It works, it's fast, and it's the least transformative option — you inherit all your existing operational habits along with the workload.

### When you provision a VM, you choose

- The **size** — CPU cores, memory, storage capacity
- The **operating system**
- The **virtual networking** configuration
- Any **additional software** to install

### Reading a VM size name

VM names encode their characteristics. Take **D2as_v5**:

| Part | Meaning |
|---|---|
| **D** | The VM family — general purpose in this case |
| **2** | Number of vCPUs |
| **a** | AMD-based processor |
| **s** | Premium storage capable |
| **v5** | Generation |

Once you can read the name, capacity planning gets considerably easier — you can see at a glance what you're comparing.

**The families worth knowing:** General purpose (B, D) for balanced workloads and testing. Compute optimised (F) for high CPU-to-memory ratios. Memory optimised (E, M) for databases and in-memory analytics. Storage optimised (L) for high disk throughput. GPU (N) for rendering and machine learning.

### Availability sets

An availability set is how you protect a VM workload against localised hardware failure and against Azure's own maintenance.

**Availability sets group VMs by:**

**Fault domains** — groups of VMs that share a common power source and network switch. Spreading across fault domains means a single rack failure doesn't take out every instance.

**Update domains** — groups of VMs and underlying hardware that can be rebooted at the same time. Azure reboots one update domain at a time during planned maintenance, then waits before moving to the next, so your workload never loses everything simultaneously.

**There is no cost for the availability set itself** — you pay only for the VM instances you create. That makes not using one for a production workload difficult to justify.

**Scale sets** take this further: they let you create and manage a group of identical, load-balanced VMs, scaling automatically with demand.

## Azure Virtual Desktop

Desktop and application virtualisation running in Azure, delivering a full desktop experience to any device.

**What makes it distinctive:**

**Windows 10 and 11 multi-session.** Several concurrent users on a single VM — a capability unique to Azure Virtual Desktop. That changes the economics substantially compared with one VM per user.

**Centralised security.** The desktop and its data live in Azure, not on the endpoint. A lost laptop is an inconvenience rather than a data breach, because nothing sensitive was ever stored on it.

**Multifactor authentication and Conditional Access** apply to desktop access, and granular RBAC controls who reaches what.

The common use cases: contractors and third parties who need access without a corporate device, developers needing high-powered workstations intermittently, and regulated environments where data must not leave a controlled boundary.

## Containers

Containers package an application with its dependencies into a portable unit. Unlike a VM, they don't include a full operating system — they share the host kernel — which makes them dramatically lighter and faster to start.

**Where containers make sense:**

- **Microservices architectures**, where each service scales independently
- **Consistency across environments** — the same image runs on a laptop, in test, and in production
- **Rapid scaling**, because starting a container is measured in seconds rather than minutes
- **Portability**, since a container runs anywhere with a compatible runtime

**Azure Container Instances** is the simplest option — run a container without managing any orchestration or servers. Good for short-lived jobs and simple workloads.

**Azure Container Apps** adds scaling, load balancing and revision management without exposing the orchestrator.

**Azure Kubernetes Service (AKS)** is full orchestration for complex, multi-container systems. Powerful, and it introduces genuine operational complexity — Kubernetes is a system you have to learn and run, not just consume.

**The honest guidance:** don't reach for AKS because it's the sophisticated option. Reach for it when you have enough services that orchestration is a real problem. Below that threshold, Container Apps or App Service will serve you better with a fraction of the operational cost.

## Azure App Service

A managed platform for building and hosting web applications, REST APIs and mobile backends, in your chosen language, without managing infrastructure.

**With App Service, you can host most common app styles:**

- **Web apps** — full support for hosting web applications
- **API apps** — build REST-based web APIs, with Swagger support and the option to publish to the Azure Marketplace
- **WebJobs** — run a program or script in the same context as a web app, API app or mobile app, useful for background tasks
- **Mobile apps** — store data in the cloud, authenticate users, send push notifications, execute backend logic

**What it handles for you:** automatic scaling, load balancing, health monitoring, deployment slots, patching, and TLS certificates. Supports **Windows and Linux**, and **.NET, .NET Core, Java, Ruby, Node.js, PHP and Python**.

Deployment slots deserve a mention — they let you deploy to a staging slot, verify it, then swap to production with no downtime, and swap back instantly if something is wrong. That's a materially better deployment story than most self-managed setups achieve.

For the majority of web workloads, App Service is the right default. It removes almost all the operational surface without removing meaningful control.

## Azure Functions

Event-driven, serverless compute. You write a function; Azure runs it when something triggers it.

**The defining characteristics:**

- **Scales automatically**, including to zero
- **You are billed only while it runs** — no charge for idle time
- **Stateless by default** (though Durable Functions add state where you need it)
- Triggered by HTTP requests, timers, queue messages, blob uploads, and many other events

**Where it genuinely fits:** work that is intermittent, event-driven and short-lived. Processing an uploaded file, responding to a webhook, running a scheduled cleanup, reacting to a queue message.

**Where it doesn't:** long-running processes, anything needing consistent low latency (cold starts are real), and workloads busy enough that always-on compute is cheaper.

The economics flip at high, steady load. A function called constantly may cost more than an App Service plan doing the same work.

## Choosing between them

A practical decision sequence:

**Does it need a specific OS, or is it legacy software that assumes a server?** → Virtual machine.

**Is it a web app or API in a mainstream language?** → App Service. This covers more cases than people expect.

**Is it event-driven and intermittent?** → Functions.

**Is it a set of services that need independent scaling and consistent packaging?** → Containers. Start with Container Apps; move to AKS only when orchestration is genuinely the problem you have.

**Are you migrating something existing and want to move fast?** → VMs first, then modernise. Lift-and-shift is a legitimate first step, provided somebody owns the second step.

The most common mistake is choosing based on what's interesting rather than what's appropriate. The compute option that requires the least of your attention while meeting the requirement is almost always the right one — the value you deliver is in the application, not in the infrastructure underneath it.

---

**References**

- [Azure compute services overview — Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/compute-decision-tree)
- [Availability sets overview — Microsoft Learn](https://learn.microsoft.com/en-us/azure/virtual-machines/availability-set-overview)
- [Azure VM sizes — Microsoft Learn](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes)
- [App Service overview — Microsoft Learn](https://learn.microsoft.com/en-us/azure/app-service/overview)
- [Azure Functions overview — Microsoft Learn](https://learn.microsoft.com/en-us/azure/azure-functions/functions-overview)
