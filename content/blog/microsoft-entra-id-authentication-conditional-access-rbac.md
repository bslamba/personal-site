---
title: "Microsoft Entra ID: Authentication, Conditional Access and RBAC"
excerpt: "How cloud identity actually works — Entra ID versus Domain Services, the three passwordless options, what Conditional Access evaluates, and how RBAC scopes inherit down the resource hierarchy."
date: "2026-06-11"
tags: ["Azure", "Entra ID", "IAM", "Cloud Security", "Conditional Access", "Zero Trust"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Microsoft Entra ID** | Cloud-based identity and access management. Employees sign in and access resources. |
| **Entra Domain Services** | **Managed domain services** — domain join, group policy, LDAP, Kerberos/NTLM — without running domain controllers. |
| **Authentication** | Proving who you are |
| **Authorisation** | What you're allowed to do once proven |
| **SSO** | One set of credentials, many applications. Fewer credentials to attack. |
| **Three passwordless options** | Windows Hello for Business · Microsoft Authenticator app · FIDO2 security keys |
| **Conditional Access** | Signals → Decision → Enforcement. Grant, block, or grant with conditions. |
| **External Identities** | B2B collaboration · B2B direct connect · Azure AD B2C |
| **RBAC scopes** | Management group → Subscription → Resource group → Resource. **Permissions inherit downward.** |
| **RBAC is** | **Allow-model** — additive, with explicit deny taking precedence |

---

Identity is the control plane in cloud. There is no perimeter to defend, no cable to unplug — access is granted or denied based on who is asking and from where. Get identity right and most of the rest becomes manageable. Get it wrong and nothing else compensates.

## Microsoft Entra ID

**Microsoft Entra ID is for:**

- **IT administrators**, controlling access to applications and resources based on business requirements
- **App developers**, adding standards-based single sign-on rather than building their own authentication
- **Users**, managing their own identities and performing self-service tasks like password reset
- **Online service subscribers**, since Microsoft 365, Office 365, Azure and Dynamics CRM Online all use Entra ID

**Microsoft Entra ID provides services such as:**

- **Authentication** — verifying identity, plus self-service password reset, multifactor authentication, a banned-password list, and smart lockout
- **Single sign-on (SSO)** — one username and password across applications, so an identity change only has to be made in one place
- **Application management** — managing cloud and on-premises apps, with My Apps, SaaS apps, the Application Proxy, and SSO
- **Device management** — registering devices so they can be managed through tools like Microsoft Intune, and used with Conditional Access

### Entra ID is not Active Directory

Worth stating plainly, because the naming invites confusion.

Active Directory Domain Services is a directory service using LDAP, Kerberos and NTLM, built for on-premises devices joined to a domain, with group policy and organisational units.

Entra ID is an identity provider for the internet, built around HTTP and HTTPS protocols — SAML, OAuth 2.0, OpenID Connect. There are no organisational units and no group policy objects.

They solve related problems in different worlds. Most organisations run both and synchronise between them.

### Microsoft Entra Domain Services

**Entra Domain Services provides managed domain services** — domain join, group policy, LDAP, and Kerberos/NTLM authentication — **without you deploying, managing or patching domain controllers in the cloud**.

The use case: you're lifting and shifting a legacy application that requires domain join or LDAP, and you don't want to run domain controllers in Azure to support it. Domain Services gives the application what it needs while Microsoft operates the infrastructure.

## Authentication methods

**Microsoft Entra ID supports three passwordless options:**

**Windows Hello for Business.** Ideal for information workers with their own designated Windows PC. Biometrics and PIN credentials are tied directly to the user's PC, preventing access by anyone other than the owner. Backed by public-key infrastructure and integrated with single sign-on.

**Microsoft Authenticator app.** Turns any iOS or Android phone into a strong, passwordless credential. Users sign in by receiving a notification, matching a number displayed on screen, and confirming with biometrics or a PIN.

**FIDO2 security keys.** An unphishable, standards-based passwordless method. Typically USB devices, but Bluetooth and NFC variants exist. Because the credential is bound to the device and to the origin, they resist phishing in a way passwords and even one-time codes do not.

**Why passwordless matters:** the security of a password depends entirely on how it's used, and shorter, simpler passwords are easier to guess while complex ones get written down or reused. Passwordless methods replace the password with something you have plus something you are or know — removing the shared secret entirely.

**Multifactor authentication** requires two or more elements from: **something you know**, **something you have**, and **something you are**. It's the single highest-value control available in cloud identity, and its effect on credential-based attacks is dramatic.

## External Identities

An external identity is a person, device or service outside your organisation that needs access to your resources.

**The following capabilities make up External Identities:**

**B2B collaboration.** Collaborate with external users by letting them use their preferred identity to sign in. Guest users are represented in your directory, and you can apply Conditional Access and other policies to them. They don't need an account you manage.

**B2B direct connect.** Establish a mutual, two-way trust with another Microsoft Entra organisation for seamless collaboration — currently supporting Teams shared channels. External users work within your instance of Teams without being represented as guest users in your directory.

**Azure AD B2C.** Publish modern SaaS or custom-developed applications to consumers and customers, while using Azure AD B2C for identity and access management. Separate from your workforce directory.

The practical distinction: B2B is for partners and contractors, B2C is for your customers. Mixing them — putting customers in your corporate directory — creates governance problems that are painful to unwind later.

## Conditional Access

Conditional Access is the mechanism that turns identity into a genuine security control rather than a gate that opens once.

**How it works:** signals are collected, a decision is made, and enforcement follows.

**Signals** include: who the user is, which device they're on, where they're connecting from, which application they're reaching, and whether the sign-in is risky.

**The decision** is one of three: **allow access**, **block access**, or **allow access with additional requirements** — usually multifactor authentication.

**Conditional Access helps IT administrators:**

- **Empower users to be productive wherever and whenever**
- **Protect the organisation's assets**

**Conditional Access is useful when you need to:**

- **Require multifactor authentication** to access an application, with rules that vary by who the user is, how they're signing in, or which network they're on
- **Require access only through approved client applications**, so unmanaged apps can't reach corporate data
- **Require users to access your application only from managed devices**
- **Block access from untrusted sources**, such as unknown or unexpected locations

### The design that actually works

The point of Conditional Access is that friction should scale with risk. A user on a managed device, on the corporate network, opening a low-sensitivity application should experience nothing. The same user on an unmanaged device from an unfamiliar country reaching a sensitive application should be challenged, or blocked.

**Two things worth doing carefully:**

**Always exclude break-glass accounts.** A policy that locks out every administrator, including you, is a genuinely bad afternoon. Maintain two emergency access accounts excluded from all Conditional Access policies, with long random credentials stored securely and monitored for use.

**Use report-only mode first.** Every new policy should run in report-only for a period so you can see what it *would* have blocked before it blocks anything. Conditional Access is powerful enough to break an organisation's access in a single save.

## Role-based access control

Authentication proves who you are. **RBAC decides what you can do.**

### Scopes and inheritance

Role assignments are applied at a scope, and **permissions inherit downward** through the resource hierarchy:

**Management group → Subscription → Resource group → Resource**

Assign a role at a management group and it applies to every subscription, resource group and resource beneath it. Assign it at a resource group and it applies only to that group and its contents.

That inheritance is the whole efficiency of the model: grant once at the right level instead of hundreds of times at the bottom.

### How assignments work

An assignment has three parts:

**Security principal** — the user, group, service principal or managed identity being granted access.

**Role definition** — the collection of permissions. Built-in roles like Owner, Contributor and Reader cover most cases; custom roles exist where they don't.

**Scope** — where the assignment applies.

### Allow model

**RBAC is an allow-model.** Permissions are **additive** — if you have two role assignments, your effective permissions are the union of both.

**Explicit deny assignments take precedence** over allow assignments. Deny is the exception rather than the mechanism; the model is fundamentally about granting.

### The roles worth knowing

| Role | Grants |
|---|---|
| **Owner** | Full access, **including the ability to delegate access to others** |
| **Contributor** | Full access to manage resources, but **cannot grant access to others** |
| **Reader** | View resources only |
| **User Access Administrator** | Manage user access to resources |

**The distinction between Owner and Contributor is the one to enforce.** Owner can hand out permissions; Contributor cannot. Owner assignments should be rare, deliberate and reviewed. In practice they're handed out because someone hit a permission error and Owner made it go away — which is how an estate ends up with forty owners and no meaningful access control.

## A practical starting position

**Enable MFA for everyone**, administrators first. Nothing else you do in identity has a comparable return.

**Move toward passwordless** where the device estate supports it. Windows Hello for Business for corporate PCs, Authenticator or FIDO2 for the rest.

**Use Conditional Access to make risk-based decisions**, not blanket ones. Report-only first, break-glass accounts excluded, always.

**Assign RBAC at the highest sensible scope** and let inheritance do the work — but grant the *least* privilege that works, not the most convenient one.

**Review Owner assignments quarterly.** It's a short list if it's healthy, and a warning sign if it isn't.

---

**References**

- [What is Microsoft Entra ID? — Microsoft Learn](https://learn.microsoft.com/en-us/entra/fundamentals/whatis)
- [Microsoft Entra Domain Services overview — Microsoft Learn](https://learn.microsoft.com/en-us/entra/identity/domain-services/overview)
- [What is Conditional Access? — Microsoft Learn](https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview)
- [Passwordless authentication options — Microsoft Learn](https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-passwordless)
- [What is Azure RBAC? — Microsoft Learn](https://learn.microsoft.com/en-us/azure/role-based-access-control/overview)
- [External Identities overview — Microsoft Learn](https://learn.microsoft.com/en-us/entra/external-id/external-identities-overview)
