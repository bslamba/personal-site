---
title: "Cisco ISE 3.x: What's New in Every Release from 3.0 to 3.5"
excerpt: "A complete version-by-version comparison of the Cisco ISE 3.x family — what each release introduced, which features are worth upgrading for, and how to decide where your deployment should sit."
date: "2026-04-23"
tags: ["Cisco ISE", "Upgrade", "Release Notes", "IPv6", "pxGrid", "Profiling"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **3.0** | The redesign. New UI, new tiered licensing (Essentials / Advantage / Premier), cloud deployment. |
| **3.1** | **pxGrid 2.0 becomes mandatory.** OpenAPI-format APIs introduced. |
| **3.2** | AI/ML endpoint analytics, pxGrid Direct, Cisco Secure Client. **Patch 3 introduces the new split-upgrade framework and makes GUI upgrade the recommended method.** |
| **3.3** | Duo as a native external identity source (patch 1). Advanced analytics and classification. |
| **3.4** | Policy enforcement, profiling and Secure Network Analytics integration improvements. Hybrid cloud. |
| **3.5** | **Full single-stack IPv6.** Cloud MFC Profiler, SNMP scan profiling, FIPS 140-3, TLS 1.3 across many workflows, Workload Connectors, continuous posture reassessment. |

**The two structural changes that matter most across the family:** pxGrid 2.0 became mandatory in 3.1, and the upgrade method itself changed in 3.2 patch 3.

---

The ISE 3.x line has been running for several years now, and the releases have not been evenly weighted. Some are incremental; two of them changed things you have to plan around.

This is a version-by-version account of what each release introduced, followed by an honest assessment of which ones justify the work of upgrading.

<div class="ver-grid">

<div class="ver-card">
  <div class="ver-num">3.0</div>
  <span class="ver-tag">The redesign</span>
  <ul>
    <li>Completely reworked user interface</li>
    <li>New tiered licensing: Essentials, Advantage, Premier</li>
    <li>Cloud deployment options</li>
    <li>Foundation for everything in the 3.x line</li>
  </ul>
</div>

<div class="ver-card">
  <div class="ver-num">3.1</div>
  <span class="ver-tag">API and pxGrid</span>
  <ul>
    <li><strong>All pxGrid connections must be pxGrid 2.0</strong></li>
    <li>Newer APIs available in OpenAPI format</li>
    <li>Breaking change for older pxGrid consumers</li>
  </ul>
</div>

<div class="ver-card">
  <div class="ver-num">3.2</div>
  <span class="ver-tag">Analytics and upgrade</span>
  <ul>
    <li>AI/ML endpoint analytics for unknown devices</li>
    <li>pxGrid Direct</li>
    <li>Cisco Secure Client replaces AnyConnect branding</li>
    <li><strong>Patch 3: new split-upgrade framework; GUI becomes the recommended upgrade method</strong></li>
  </ul>
</div>

<div class="ver-card">
  <div class="ver-num">3.3</div>
  <span class="ver-tag">Identity and visibility</span>
  <ul>
    <li>Cisco Duo as a native external identity source for MFA (patch 1)</li>
    <li>Advanced analytics and classification</li>
    <li>Improved visibility into device behaviour</li>
  </ul>
</div>

<div class="ver-card">
  <div class="ver-num">3.4</div>
  <span class="ver-tag">Consolidation</span>
  <ul>
    <li>Enhanced policy enforcement</li>
    <li>Advanced profiling for unauthorised device detection</li>
    <li>Improved Secure Network Analytics integration</li>
    <li>Better cloud-native tool compatibility for hybrid estates</li>
  </ul>
</div>

<div class="ver-card">
  <div class="ver-num">3.5</div>
  <span class="ver-tag">IPv6 and compliance</span>
  <ul>
    <li><strong>Full single-stack IPv6 support</strong></li>
    <li>Cloud Multi-Factor Classification Profiler</li>
    <li>SNMP scans for endpoint profiling</li>
    <li>FIPS 140-3 mode</li>
    <li>TLS 1.3 across portals, pxGrid, TACACS+ and more</li>
    <li>Workload Connectors and Common Policy</li>
  </ul>
</div>

</div>

## Release by release

### ISE 3.0 — the reset

3.0 was where the product was visually and commercially rebuilt. A completely reworked interface, and — more consequentially — the move to **tiered subscription licensing**.

The tiers are nested: **Essentials**, **Advantage**, **Premier**, where each higher tier includes everything in the lower ones. A Premier licence provides all the capabilities of Advantage and Essentials.

That licensing change is worth understanding because it determines what you can actually turn on. Endpoint profiling classification in authorisation policies, pxGrid, pxGrid Cloud and pxGrid Direct all sit at **Advantage** level.

### ISE 3.1 — pxGrid 2.0 becomes mandatory

The change with the biggest planning impact in the whole line, and it's easy to miss because it isn't a headline feature.

**From Cisco ISE release 3.1, all pxGrid connections must be based on pxGrid 2.0.** The older XMPP-based pxGrid 1.0 is gone.

If you have integrations built against 1.0 — older Firepower versions, third-party tools, custom code — they stop working. This is a genuine breaking change and it needs checking against every pxGrid consumer before you upgrade past 3.0.

3.1 also introduced **OpenAPI-format APIs**, which is a substantial improvement if you automate against ISE. Standard tooling, generated clients, proper documentation.

### ISE 3.2 — analytics, and a new way to upgrade

Two significant threads.

**AI/ML endpoint analytics.** ISE uses Cisco AI Endpoint Analytics to track multiple data sources and apply machine learning to automatically analyse and classify unknown devices based on their behaviour. This is the beginning of the profiling improvements that continue through 3.5.

**pxGrid Direct**, which pulls context from external sources rather than only publishing ISE's own.

**And then patch 3, which changed how upgrades work.** A new split upgrade framework was introduced in 3.2 patch 3 to improve stability, and **from 3.2 patch 3 onwards, upgrading through the GUI is the recommended method**.

That matters when planning: your source version determines which upgrade methods are available to you. Below 3.2 patch 3 you're on the older path.

### ISE 3.3 — identity sources and classification

**From Cisco ISE release 3.3 patch 1, you can directly integrate Cisco Duo as an external identity source for MFA workflows.** Native integration rather than a RADIUS proxy arrangement, which is meaningfully simpler.

The release also continued the analytics and classification work, improving visibility into network activity and device behaviour.

### ISE 3.4 — consolidation

A quieter release. Enhanced policy enforcement for devices accessing the network, advanced profiling to detect unauthorised users or devices, improved integration with Cisco Secure Network Analytics for threat detection, and easier cloud integration with better compatibility for cloud-native security tools in hybrid setups.

Useful, incremental, and not on its own a reason to schedule an upgrade window.

### ISE 3.5 — the substantial one

The largest feature release in the line. The highlights that actually change what's possible:

**Full single-stack IPv6 support**, expanding supported configurations across portals, RADIUS services and APIs. IPv6 support extends to **TrustSec AAA servers** and **SXP** — SXP now works on IPv6 nodes, with a Node ID field that requires an IPv4 address to uniquely identify the SXP node.

**Cloud Multi-Factor Classification (MFC) Profiler** — shares observed attributes with the cloud for analysis, improving endpoint labelling and grouping. Enabled under Administration → FeedService.

**New MFC-based profiling policies** with custom rules and direct mapping rules, alongside the existing AI/ML and system rules.

**SNMP scans for endpoint profiling** — scheduled or on-demand scans across subnets or IP ranges, collecting OS and hardware information. Aimed squarely at infrastructure endpoints that can't authenticate.

**FIPS 140-3 mode.** Note what it disables: IPsec, SSHv2, LDAPS, pxGrid, pxGrid Direct, TC-NAC Tenable and pxGrid Cloud components. That's a significant trade-off to understand before enabling it.

**TLS 1.3** across self-registered guest, sponsor and hotspot portals, pxGrid, TACACS+, Catalyst Center, Meraki and Duo integrations, PEAP workflows, and posture feed service communication.

**TACACS over TLS** for network device administration, validating SAN attributes including IP address, DNS name and directory name.

**Workload Connectors and Common Policy** — a framework for consistent access and segmentation policy across domains, building connections to on-premises and cloud data centres, importing application workload context and normalising it into SGTs.

**Continuous posture reassessment** using Cisco Secure Client — detecting posture changes as they occur for certain events, and at ten-minute intervals for others.

**Time-restricted debug enabling** — select a log level and set a reset timer, after which the node reverts to default. A direct answer to debugs being left on, which is one of the more common self-inflicted performance problems.

**Five new alarms:** high ping latency between ISE nodes, slow Active Directory, slow LDAP connection, slow ODBC connection, and excessive TACACS communication.

**Certificate-based authentication with Microsoft Entra ID** for both user and device flows via EAP-TLS and TEAP chaining.

**A licensing change worth noting:** from 3.5, some Advantage features — pxGrid, pxGrid Direct, profiling services and TrustSec — consume licences according to the number of active endpoints using each feature. Enforcement for out-of-compliance licences is not currently implemented, but the counting has changed.

### 3.5 patch releases

**Patch 1** added USB disk encryption posture conditions, OAuth support for SMTP, and OpenID Connect authentication for self-registered guest portals.

**Patch 2** contained no new features.

**Patch 3** added the Workload Connector Endpoints dashboard, high availability and failover for TC-NAC nodes, the option to include Message-Authenticator in all RADIUS response packets, OAuth support for MDM vendors, SGACL syntax validation, **Windows Server 2025 Active Directory support**, HTTP 2.0 on the API gateway, and continuous reassessment.

The Windows Server 2025 support carries a caveat: due to enhanced security settings in Windows Server 2025, **password changes through EAP-MS-CHAPv2 and EAP-GTC are disabled by default**.

## Which version should you be on

An honest assessment rather than "always take the latest".

<div class="fancy-table">

<table>
<thead>
<tr><th>Your situation</th><th>Recommendation</th><th>Why</th></tr>
</thead>
<tbody>
<tr>
  <td>Running 2.x</td>
  <td><span class="pill-bad">Upgrade now</span></td>
  <td>Support and security. Plan a multi-hop path or a rebuild.</td>
</tr>
<tr>
  <td>On 3.0 or 3.1</td>
  <td><span class="pill-warn">Plan an upgrade</span></td>
  <td>Approaching or past support boundaries. Getting to 3.2 patch 3+ also unlocks the better upgrade methods.</td>
</tr>
<tr>
  <td>On 3.2 or 3.3, stable</td>
  <td><span class="pill-good">No urgency</span></td>
  <td>Upgrade when a specific 3.5 feature justifies it, or when support dictates.</td>
</tr>
<tr>
  <td>Need IPv6-only anywhere</td>
  <td><span class="pill-bad">3.5 required</span></td>
  <td>Nothing earlier provides full single-stack IPv6.</td>
</tr>
<tr>
  <td>Need FIPS 140-3</td>
  <td><span class="pill-bad">3.5 required</span></td>
  <td>Check what FIPS mode disables before committing.</td>
</tr>
<tr>
  <td>Large <code>Unknown</code> endpoint population</td>
  <td><span class="pill-warn">3.5 worth considering</span></td>
  <td>Cloud MFC Profiler plus SNMP scan profiling target exactly this.</td>
</tr>
<tr>
  <td>Need Duo as an identity source</td>
  <td><span class="pill-warn">3.3 patch 1 or later</span></td>
  <td>Native integration rather than a RADIUS proxy.</td>
</tr>
<tr>
  <td>Running old pxGrid consumers</td>
  <td><span class="pill-bad">Check before 3.1</span></td>
  <td>pxGrid 1.0 support is removed. Verify every consumer.</td>
</tr>
</tbody>
</table>

</div>

## The two changes to plan around

Most releases you can adopt or skip. These two you have to account for.

<div class="callout">
<p><strong>pxGrid 2.0 became mandatory in 3.1.</strong> Every pxGrid consumer in your environment — Firepower, DNA Center, StealthWatch, third-party tools, anything custom — must support 2.0 before you cross this boundary. An integration that silently stops working is a poor way to discover this.</p>
<p><strong>The upgrade method changed in 3.2 patch 3.</strong> GUI upgrade became the recommended path and the split-upgrade framework was reworked. Your <em>source</em> version determines which methods are available, so this affects planning even when you're upgrading to something much newer.</p>
</div>

## A note on reading release notes

Two habits worth forming, given how much is in these releases.

**Read the deprecations, not just the additions.** Feature removals cause more upgrade problems than feature additions, and they're never in the marketing summary. The FIPS 140-3 mode in 3.5 disabling IPsec, SSHv2, LDAPS and all the pxGrid components is a good example — genuinely important, easy to miss.

**Check the patch-level notes.** Meaningful features arrive in patches, not only in point releases. Windows Server 2025 support landed in 3.5 patch 3; Duo as an identity source landed in 3.3 patch 1. "We're on 3.5" and "we're on 3.5 patch 3" are materially different statements.

---

**References**

- [ISE 3.5 Administrator Guide — New and changed information](https://www.cisco.com/c/en/us/td/docs/security/ise/3-5/admin_guide/b_ise_admin_3_5/new_and_changed_info.html)
- [ISE 3.4 Administrator Guide — New and changed information](https://www.cisco.com/c/en/us/td/docs/security/ise/3-4/admin_guide/b_ise_admin_3_4/new_and_changed_info.html)
- [Release Notes for Cisco ISE 3.5](https://www.cisco.com/c/en/us/td/docs/security/ise/3-5/release_notes/cisco-ise-release-notes-35.html)
- [Release Notes for Cisco ISE 3.3](https://www.cisco.com/c/en/us/td/docs/security/ise/3-3/release_notes/b_ise_33_RN.html)
- [Release Notes for Cisco ISE 3.1](https://www.cisco.com/c/en/us/td/docs/security/ise/3-1/release_notes/b_ise_31_RN.html)
- [Cisco ISE Licensing — Essentials, Advantage and Premier](https://www.cisco.com/site/us/en/products/security/identity-services-engine/licensing.html)
