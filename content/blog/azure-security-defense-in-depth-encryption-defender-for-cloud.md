---
title: "Azure Security: Defense in Depth, Encryption and Defender for Cloud"
excerpt: "The seven layers of defense in depth and what belongs at each, the difference between encryption at rest and in transit, why key management is the real control, and what Defender for Cloud actually does."
date: "2026-06-18"
tags: ["Azure", "Cloud Security", "Zero Trust", "Defender", "Key Vault", "Encryption"]
draft: false
---

## Cheat sheet

| Layer | What belongs there |
|---|---|
| **Physical security** | Datacenter access control — the provider's responsibility |
| **Identity and access** | MFA, Conditional Access, least privilege, audited access |
| **Perimeter** | DDoS protection, perimeter firewalls |
| **Network** | Segmentation, deny by default, restrict inbound and outbound |
| **Compute** | Endpoint protection, patching, secure remote access |
| **Application** | Secure development, no secrets in code |
| **Data** | Encryption, classification, access control |

| | |
|---|---|
| **Encryption at rest** | Data on disk, in a database, in blob storage |
| **Encryption in transit** | Data moving across a network |
| **A strong posture includes both** | |
| **Key Vault** | Centralised storage for keys, secrets and certificates |
| **Defender for Cloud** | Posture management **and** threat protection, across Azure, on-premises and other clouds |
| **CIA triad** | Confidentiality · Integrity · Availability |

---

Security in cloud is not a product you buy. It's a set of overlapping controls arranged so that no single failure becomes a breach.

## Defense in depth

The principle is straightforward: **use a layered approach so that if one layer is breached, the next one stops or slows the attack.** No layer is expected to be perfect. The goal is to remove any single point of catastrophic failure, and to buy detection time.

![Defense in depth layers from physical security to data](/blog-images/azure/defense-in-depth-layers.svg)

**Here's a brief overview of the role of each layer:**

### Physical security

The first line of defense — protecting computing hardware in the datacenter itself.

This layer is **entirely the provider's responsibility** in every cloud service model. Microsoft operates the buildings, controls physical access, and holds the certifications that prove it. It's also the layer you can never audit yourself, which is why the compliance documentation exists.

### Identity and access

**At this layer, it's important to:**

- Control access to infrastructure and change control
- **Use single sign-on and multifactor authentication**
- **Audit events and changes**

This is the layer that matters most in cloud, because it has replaced the network perimeter as the primary boundary. An attacker with valid credentials isn't breaking in — they're walking in.

### Perimeter

**At this layer, it's important to:**

- Use **DDoS protection** to filter large-scale attacks before they can affect availability
- Use **perimeter firewalls** to identify and alert on malicious attacks against your network

### Network

**At this layer, it's important to:**

- **Limit communication between resources** through segmentation and access controls
- **Deny by default**
- **Restrict inbound internet access** and limit outbound where appropriate
- **Implement secure connectivity to on-premises networks**

Deny by default is the important one, and the one most often compromised in practice. A network security group that permits everything and blocks specific things is an artefact of firewall habits, and it fails open every time someone adds a service you didn't anticipate.

### Compute

**At this layer, it's important to:**

- **Secure access to virtual machines**
- **Implement endpoint protection** on devices and keep systems patched

Unpatched VMs remain one of the most reliable initial access vectors. In IaaS this is entirely your responsibility — the shared responsibility model puts the operating system on your side of the line.

### Application

**At this layer, it's important to:**

- **Ensure applications are secure and free of vulnerabilities**
- **Store sensitive application secrets in a secure storage medium**
- **Make security a design requirement** for all application development

The middle point deserves emphasis. Connection strings and API keys in source code, in configuration files, or in environment variables in a repository are among the most common findings in any cloud assessment. Key Vault exists precisely to solve this, and using it costs almost nothing.

### Data

**In almost all cases, attackers are after data:**

- Stored in a database
- Stored on disk inside virtual machines
- Stored in SaaS applications such as Office 365
- Managed through cloud storage

Everything above exists to protect this layer. It's worth reasoning backwards from it: what data do you hold, where is it, who can reach it, and what would it cost you if it left?

## The CIA triad

Three properties, and every security control serves at least one:

**Confidentiality** — only those authorised may access the data. This is the principle of least privilege.

**Integrity** — data cannot be changed without detection. In practice, hashing at send and receive so tampering is provable.

**Availability** — the data and systems are there when authorised users need them. Denial of service attacks target this directly, and it's the property most often forgotten in security design.

## Zero Trust

Zero Trust assumes breach. Rather than trusting anything inside a network boundary, every request is verified as though it originated from an uncontrolled network.

**Three guiding principles:**

**Verify explicitly.** Authenticate and authorise based on all available data points — identity, location, device health, service, data classification, and anomalies.

**Use least privilege access.** Just-in-time and just-enough access, risk-based adaptive policies, and data protection.

**Assume breach.** Segment access, verify end-to-end encryption, use analytics for visibility and threat detection.

The practical shift from a traditional model: the old approach trusted everything on the corporate network and controlled the boundary. That model broke the moment work happened from anywhere, on any device, against SaaS applications you don't host.

## Encryption

**In Azure, encryption is commonly discussed in two forms:**

**Encryption at rest** — data on physical media. A database, a disk attached to a VM, a blob in storage. The data is encrypted before it's written and decrypted when read by an authorised party.

**Encryption in transit** — data moving across a network. TLS for application traffic, VPN or ExpressRoute for network-level protection.

**A strong security posture generally includes both.** Encrypting at rest without encrypting in transit protects against a stolen disk but not against an observer on the network; the reverse protects against interception but not against physical access.

Azure encrypts at rest by default across most services. The interesting question is usually not *whether* it's encrypted but **who holds the keys**.

## Key management

**Key management supports security and compliance goals by helping you:**

- **Centralise storage** of application secrets, reducing the number of places sensitive information exists
- **Securely store secrets and keys**, using access control and, where required, hardware security modules
- **Monitor access and use**, so you can see who accessed what and when
- **Simplify administration** of application secrets, including certificate provisioning and renewal
- **Integrate with other Azure services** such as storage accounts, container registries, and databases

**Azure Key Vault** is the service that does this. Three kinds of object: **keys** (cryptographic), **secrets** (passwords, connection strings, API keys), and **certificates** (with automatic renewal).

**Customer-managed keys** are worth understanding. By default Microsoft manages the encryption keys. You can instead supply and control your own, held in Key Vault — which gives you the ability to revoke access to your own data by revoking the key. That's a meaningful control for regulated workloads, and it's also a meaningful way to lose access to your data permanently if key lifecycle isn't managed carefully.

## Microsoft Defender for Cloud

Defender for Cloud does two distinct jobs, and it's worth separating them because organisations often use one and not the other.

### Cloud security posture management

Continuous assessment of your resources against security best practice, producing a **secure score** and prioritised recommendations.

This is the preventative half. It tells you that a storage account is publicly accessible, that a VM has no endpoint protection, that a subnet permits inbound RDP from the internet — before any of those become an incident.

The secure score is useful mostly as a trend. Its absolute value matters less than whether it's improving, and whether the highest-impact recommendations are being addressed rather than the easiest ones.

### Threat protection

**Defender for Cloud helps you detect threats across:**

- **Azure PaaS services** — including App Service, SQL, Storage accounts, and others
- **Azure data services** — automatically classifying data in SQL databases and helping detect data that may be at risk
- **Networks** — limiting exposure to brute force attacks, reducing access to VM ports through just-in-time VM access, and detecting anomalous traffic

**For connected AWS environments, Defender for Cloud can:**

- **Detect security misconfigurations**
- **Provide a single view** showing Defender for Cloud recommendations and AWS Security Hub findings together
- **Incorporate AWS resources into the secure score calculation**
- **Apply regulatory compliance assessments** to AWS resources

That multi-cloud capability is genuinely useful for organisations running both. One posture view rather than two consoles and a spreadsheet.

### Just-in-time VM access

Worth calling out specifically because it addresses one of the most common and most exploited exposures.

Management ports — RDP on 3389, SSH on 22 — left open to the internet are scanned and attacked continuously. Just-in-time access keeps them closed and opens them only on request, for a named user, for a limited window, from a specified source address.

It's a small configuration change that removes an entire category of attack, and it's frequently not enabled because opening the port permanently was simpler on the day.

## Where to start

If you inherit an Azure estate and need to improve its security position, roughly this order:

**Enable MFA for every administrator.** Nothing else has a comparable effect for the effort.

**Turn on Defender for Cloud** and read the secure score recommendations. It will find things.

**Close management ports** and use just-in-time access.

**Get secrets out of code** and into Key Vault.

**Check what's publicly accessible** — storage accounts and databases especially. Public exposure is the single most common serious finding.

**Then** worry about the sophisticated controls. The gap between an estate with those five things done and one without them is far larger than the gap between a well-configured estate and a perfectly configured one.

---

**References**

- [Azure security fundamentals documentation — Microsoft Learn](https://learn.microsoft.com/en-us/azure/security/fundamentals/)
- [Zero Trust guidance centre — Microsoft Learn](https://learn.microsoft.com/en-us/security/zero-trust/)
- [Azure data encryption at rest — Microsoft Learn](https://learn.microsoft.com/en-us/azure/security/fundamentals/encryption-atrest)
- [About Azure Key Vault — Microsoft Learn](https://learn.microsoft.com/en-us/azure/key-vault/general/overview)
- [What is Microsoft Defender for Cloud? — Microsoft Learn](https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-cloud-introduction)
