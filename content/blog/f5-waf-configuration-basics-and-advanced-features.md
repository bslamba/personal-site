---
title: "F5 Advanced WAF: Building the Basics and What the Advanced Features Actually Do"
excerpt: "The seven steps to a working F5 configuration, why SNAT breaks your logging and how X-Forwarded-For fixes it, deployment topologies, and a tour of the advanced WAF feature set."
date: "2026-01-29"
tags: ["F5", "WAF", "Web Security", "Load Balancing", "Application Security"]
draft: false
---

## Cheat sheet

**Building a basic configuration — in order:**

| # | Step | Where |
|---|---|---|
| 1 | Create Self IPs | Network → Self IPs → New Self IP |
| 2 | Create VLANs | Network → VLANs |
| 3 | Assign Self IPs to VLANs | — |
| 4 | Assign the default gateway | Network → Routes → Add |
| 5 | Create Pools (origin servers) | Local Traffic → Pools → Create, then set load balancing method |
| 6 | Create Virtual Servers | Local Traffic → Virtual Servers |
| 7 | Configure SNAT Automap on the virtual server | — |

| | |
|---|---|
| **SNAT** | Rewrites the **source** address of the connection |
| **DNAT** | Rewrites the **destination** address |
| **SNAT Automap** | Translates the client IP to the self IP of the egress VLAN, ensuring the response returns to the BIG-IP |
| **Two-Armed Inline** | SNAT optional |
| **One-Armed** | Virtual server **must** be SNAT enabled |
| **Asymmetric traffic** | Breaks the F5 full proxy architecture |
| **XFF** | Insert the original client IP in an `X-Forwarded-For` header and configure the web server to log from that header instead of the SNAT address |

**Test everything:** parameters, headers, URL, cookies, JSON, SOAP and XML data inputs.

---

An F5 sitting in front of a web application is doing two jobs that people often conflate: load balancing traffic, and inspecting it. The configuration order below builds the first, and the advanced features layer on the second.

## Building the basic configuration

The order matters, because each step depends on the one before it.

### 1. Self IPs

**Network → Self IPs → New Self IP**

A self IP is the BIG-IP's own address on a given VLAN. It's how the device participates in each network it touches, and it's what SNAT will translate client addresses to.

### 2. VLANs

**Network → VLANs**

Define the VLANs the device connects to — typically an external VLAN facing clients and an internal one facing servers.

### 3. Assign self IPs to VLANs

Bind each self IP to its VLAN. Now the BIG-IP has an address on each network.

### 4. The default gateway

**Network → Routes**, then **Add**

Without a default route, the BIG-IP can reach its directly-connected networks and nothing else.

### 5. Pools

**Local Traffic → Pools**, then **Create**

A pool is the group of origin servers behind the virtual server. Add the members and choose a **load balancing method**:

- **Round Robin** — even distribution, ignores load. Fine when servers are identical and requests are uniform.
- **Least Connections** — sends to the member with fewest active connections. Better when request duration varies.
- **Ratio** — weighted, for mixed server capacity.
- **Fastest** — based on response time.

Configure health monitors on the pool. Without them, the BIG-IP keeps sending traffic to dead members.

### 6. Virtual servers

**Local Traffic → Virtual Servers**

The virtual server is the address and port clients actually connect to. It binds together the listening address, the pool behind it, and the profiles applied — HTTP, SSL, and the WAF policy.

### 7. SNAT Automap

Configured on the virtual server.

**SNAT Automap translates the client IP to the self IP of the egress VLAN**, which ensures the response returns to the BIG-IP rather than going directly from the server back to the client.

## Why SNAT matters, and what it costs

**With SNAT, the IP address of the computer which initiated the connection is rewritten.** Its counterpart, **DNAT**, rewrites the destination addresses of data packets instead.

**Why you need it:** the BIG-IP is a full proxy. It terminates the client connection and opens a separate one to the server. If the server sees the real client IP as the source, its reply routes back to the client directly — bypassing the BIG-IP entirely. The client then receives a response from an address it never sent to, and drops it.

SNAT prevents that by making the BIG-IP the source, so the server has no choice but to reply through it.

**What it costs you:** the server now sees every request as coming from the BIG-IP's self IP. Your web server logs contain one address, repeated. Rate limiting by IP at the application becomes meaningless. Geo-blocking at the application breaks. Any per-client logic breaks.

**The fix — X-Forwarded-For:**

To avoid logging the SNAT address, configure the BIG-IP to insert the original client IP in an **X-Forwarded-For (XFF)** HTTP header, and configure the web server that is receiving the request to log the client IP address from the header instead of the SNAT address.

Enable XFF insertion in the HTTP profile, then reconfigure the web server's log format. In Apache that's changing `%h` to `%{X-Forwarded-For}i`; in nginx, `$http_x_forwarded_for` or the `realip` module.

**A security note that gets missed:** if the application trusts XFF blindly, a client can forge it. The BIG-IP should *overwrite* the header rather than append to it, and the application should only trust XFF from known proxy addresses. Otherwise you've handed attackers a way to spoof their apparent source for anything that uses it.

## Deployment topologies

**Two-Armed Inline** — the BIG-IP has interfaces on both the client-side and server-side networks, and traffic passes through it. **SNAT is optional** here, because return traffic naturally routes back through the device.

**One-Armed** — the BIG-IP has a single interface on the same network as the servers. **The virtual server must be SNAT enabled**, without exception. Without SNAT, servers reply directly to clients and the proxy is bypassed.

**The rule that governs both:** **asymmetric traffic will break the F5 full proxy architecture.** A full proxy must see both directions of every connection. If traffic arrives via one path and returns via another, the device has half a conversation and the connection fails in ways that look like an application fault.

This is worth checking explicitly in any deployment with multiple paths or routing changes. Asymmetry introduced by a routing change months later produces a very confusing incident.

## The advanced WAF features

Beyond load balancing, this is what Advanced WAF actually provides.

### 1. Advanced parameter handling

Granular control over individual parameters — expected type, length, permitted character sets, whether a value is required. Rather than a generic signature match, you define what each parameter should legitimately contain, and anything else is rejected.

More work to configure, considerably more precise than signatures alone.

### 2. Login enforcement, brute force mitigation and session tracking

Three related capabilities:

- **Defining login pages** — telling the WAF which URLs authenticate users
- **Configuring automatic detection of login pages** — letting it identify them from traffic patterns
- **Defining session tracking** — following a user across requests

Once the WAF knows where login happens, it can enforce that protected pages are only reached *after* it, and detect brute force by counting failures per user and per source.

Session tracking is what enables blocking a user rather than an IP — considerably more useful behind NAT.

### 3. Web scraping mitigation and geolocation enforcement

- **Defining and mitigating web scraping** — detecting automated harvesting by behaviour rather than signature
- **Configuring IP address exceptions** — allowing known-good automation through
- **Geolocation enforcement** — permitting or denying by country

Geolocation is blunt but effective when your user base is genuinely regional. Set exceptions carefully; VPN users and travelling staff will trip it.

### 4. DoS mitigation and advanced bot protection

The most operationally significant set:

- **Denial of service attacks** — detection and response
- **TPS-based DoS protection** — thresholds on transactions per second
- **Proactive bot defence** — challenging clients before they reach the application
- **Behavioural and stress-based detection** — using server stress as a signal rather than fixed thresholds
- **Behavioural DoS mitigation** — building a model of normal traffic and acting on deviation

The behavioural approach is the meaningful advance. Fixed TPS thresholds are either too tight (blocking legitimate traffic peaks) or too loose (missing slow attacks). A model of normal behaviour adapts.

### 5. iRules

F5's scripting layer, and the escape hatch for anything the GUI can't express.

- **Common uses for iRules** — custom redirects, header manipulation, conditional routing, blocking specific patterns
- **Identifying iRule components** — events, commands, variables
- **Triggering iRules with events** — `HTTP_REQUEST`, `HTTP_RESPONSE`, `CLIENT_ACCEPTED` and others

iRules run on the traffic path, so inefficient ones cost performance directly. Powerful, and easy to misuse.

### 6. Content profiles

Handling structured data formats properly:

- **Asynchronous JavaScript and XML (AJAX)**
- **JavaScript Object Notation (JSON)**

This matters more than it sounds. A modern application sends most of its data as JSON in request bodies, not as form parameters. A WAF that only inspects parameters is blind to most of the attack surface. JSON content profiles let it parse the structure and validate individual fields.

## Testing

**Automated testing of all parameters, headers, URL, cookies, JSON, SOAP and XML data inputs is strongly encouraged.**

That list is the point. Most testing covers form fields and stops. Attackers test headers, cookies and JSON bodies, because that's where validation is usually weakest — a `User-Agent` header reaching a SQL query is a real vulnerability class, and no amount of form validation catches it.

Build the test suite around every input the application accepts, not the ones a user can see.

## Practical advice

**Deploy in transparent mode first.** Log what the policy *would* block without blocking it. Run it for weeks. You will find legitimate traffic matching signatures, and you want to find it before it becomes an outage.

**Learn from real traffic.** F5's policy building can construct a policy from observed traffic. Far more accurate than a generic template, provided the learning period covers genuine usage rather than a quiet week.

**Watch for asymmetric routing after any network change.** It's the failure that arrives late and looks like something else.

**Check XFF is working before you need it.** The first time you need to know which client did something is a bad time to discover every log line says the same self IP.

---

An F5 in front of an application is a full proxy, and most of the surprises come from that fact — SNAT, asymmetry, and logging all follow from it. Get the traffic path right first; the WAF features are only useful once the device reliably sees both halves of every conversation.
