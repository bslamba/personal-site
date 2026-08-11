---
title: "How DNS Actually Resolves a Name, and the Five Ways It Breaks"
excerpt: "Recursive versus iterative resolution, the record types worth knowing, why DNS uses both UDP and TCP, and the failure modes that get blamed on everything except DNS."
date: "2025-12-25"
tags: ["Networking", "DNS", "Fundamentals", "Troubleshooting"]
draft: false
---

## Cheat sheet

| | |
|---|---|
| **Ports** | **UDP 53** for normal queries, **TCP 53** for large responses and zone transfers |
| **Recursive** | Your resolver does the work and returns a final answer |
| **Iterative** | Each server returns a referral to the next server down |
| **Resolution order** | Root (`.`) → TLD (`.com`) → authoritative (`example.com`) |
| **A** | Name → IPv4 address |
| **AAAA** | Name → IPv6 address |
| **CNAME** | Alias to another name |
| **MX** | Mail exchanger, with priority |
| **NS** | Which servers are authoritative for this zone |
| **PTR** | IP → name (reverse lookup) |
| **TXT** | Arbitrary text — SPF, DKIM, domain verification |
| **SOA** | Zone authority and timers |
| **SRV** | Service location — used heavily by Active Directory |
| **TTL** | How long the answer may be cached. The reason changes take time. |

**If you only permit UDP 53 on your firewall, large responses fail intermittently and mysteriously.**

---

DNS is the system everyone depends on and nobody monitors until it fails, at which point every application appears broken simultaneously.

It's worth understanding properly, because "it's DNS" is right often enough to be a running joke and yet is still rarely the first thing checked.

## What happens when you resolve a name

Say a machine looks up `www.example.com` and nothing is cached anywhere.

**1. The client asks its configured resolver.** This is a **recursive** query — "go and find the answer, don't come back with directions."

**2. The resolver asks a root server.** There are 13 root server addresses. The root doesn't know `www.example.com`, but it knows who runs `.com`, and it returns a referral. This is an **iterative** response.

**3. The resolver asks a `.com` TLD server.** It doesn't know the host either, but it knows the authoritative name servers for `example.com`. Another referral.

**4. The resolver asks the authoritative server for `example.com`.** This one knows, and returns the A record.

**5. The resolver caches the answer** for its TTL and returns it to the client.

The key distinction: your client makes one **recursive** query. Your resolver makes several **iterative** queries on your behalf. That's why a client only ever needs to know one or two resolver addresses.

## Why DNS uses both UDP and TCP

**UDP 53** for normal queries. It's fast, connectionless, and a query and response fit comfortably in one datagram. No handshake, no teardown — exactly right for something that happens thousands of times a minute.

**TCP 53** when the response is too large. Originally that meant zone transfers between name servers. Now it also means DNSSEC responses, which carry signatures and are substantially bigger, and any response with a lot of records.

**The operational consequence:** a firewall permitting only UDP 53 works almost all the time and then fails on specific lookups. The symptom is maddening — most names resolve, a few don't, and there's no obvious pattern until someone notices the failing ones are all DNSSEC-signed.

Permit both.

## The records worth knowing

**A** — name to IPv4 address. The fundamental one.

**AAAA** — name to IPv6 address. "Quad-A". Note that a host with both will generally prefer IPv6, which occasionally surprises people troubleshooting connectivity to a service they assumed was being reached over IPv4.

**CNAME** — an alias pointing at another name. Useful, with one hard rule: a CNAME cannot coexist with other records at the same name. That's why you can't CNAME a zone apex — `example.com` needs SOA and NS records, so it can't be a CNAME. Providers work around this with non-standard ALIAS or ANAME records.

**MX** — mail exchangers, with a priority value. Lower number is higher preference.

**NS** — the authoritative name servers for a zone. This is what makes delegation work.

**PTR** — reverse lookup, IP to name. Lives in the `in-addr.arpa` tree. Frequently absent or wrong, and mail servers care about it more than anything else does.

**TXT** — arbitrary text. Now carries most of email authentication (SPF, DKIM, DMARC) and almost every domain ownership verification scheme.

**SOA** — Start of Authority. Zone serial number and the timers governing secondary server behaviour.

**SRV** — service location: which host and port provides a given service. **Active Directory depends on this heavily** — domain controller location, Kerberos, LDAP are all discovered through SRV records. An AD environment with broken SRV records has broken authentication, and the error messages rarely mention DNS.

## TTL, and why changes take time

Every record carries a **Time To Live** — how long resolvers may cache the answer.

Set a record's TTL to 86400 and change the record, and resolvers that cached the old value will keep serving it for up to a day. Nothing you do at the authoritative server changes that.

**The standard practice before a planned change:** lower the TTL to 300 well in advance — at least one old-TTL period ahead — make the change, confirm, then raise it again. Skipping the lowering step is the reason migrations produce a long tail of users still hitting the old address.

## The five ways DNS breaks

### 1. Resolver unreachable

Everything fails at once, and the symptom is "the internet is down". Every application reports a different error, none of which mention DNS.

**Check:** `dig @<resolver> example.com` — querying the resolver directly separates "resolver is down" from "resolution is broken".

### 2. Stale cache after a change

The record was updated but clients still get the old answer. TTL, as above.

**Check:** query the authoritative server directly and compare with what your resolver returns.

```
dig @ns1.example.com www.example.com
dig www.example.com
```

Different answers means caching, not configuration.

### 3. Split-horizon confusion

Internal and external DNS return different answers for the same name — a common and legitimate design. It breaks when a device is using a public resolver on a network where it should be using the internal one, and gets the external address for an internal service.

**This is the one that bites portal deployments.** A guest device configured with 8.8.8.8 tries to resolve your captive portal's FQDN, gets nothing (or the wrong thing) because the name only exists internally, and the portal never loads. It's why portal FQDNs should resolve publicly.

### 4. Only UDP permitted

Covered above. Intermittent failures on large responses.

### 5. Missing or wrong PTR

Reverse lookup absent or pointing at the wrong name. Mostly affects mail delivery — receiving servers check that the sending IP has a PTR matching its HELO — and some logging systems that do reverse lookups and hang waiting for a timeout.

## Tools worth using properly

**`dig`** is the right tool. `nslookup` is deprecated and gives less information.

```bash
dig example.com
dig example.com MX
dig @8.8.8.8 example.com
dig +trace example.com
dig -x 93.184.216.34
```

**`+trace`** is the powerful one. It performs the full iterative walk from the root, showing each referral. When resolution is failing and you don't know where, this shows you exactly which step breaks.

**`+short`** when you just want the answer:

```bash
dig +short example.com
```

**On Windows:**

```
nslookup -type=A example.com
ipconfig /displaydns
ipconfig /flushdns
```

## A troubleshooting order that works

1. **Does the name resolve at all?** `dig example.com`
2. **Does it resolve from a different resolver?** `dig @8.8.8.8 example.com` — different answer means your resolver or its cache.
3. **What does the authoritative server say?** `dig @<authoritative-ns> example.com` — the ground truth.
4. **Where does the chain break?** `dig +trace example.com`
5. **Is it a caching issue?** Compare TTLs. A TTL counting down from a low number means it's cached; the full value means it was just fetched.

That sequence distinguishes a configuration problem from a caching problem from a reachability problem in under a minute, which is faster than almost any other diagnosis available.

## Why DNS matters to network access control

Worth stating explicitly, because it's a dependency people miss when designing NAC.

**Captive portals depend on DNS.** The redirect points at a name. Your pre-authentication or redirect ACL must permit DNS, or the browser can't resolve the portal and the user sees a timeout rather than a login page.

**Certificate validation often depends on DNS.** OCSP and CRL endpoints are names. An endpoint that can't resolve them may fail validation or hang.

**Active Directory depends on DNS.** SRV records locate domain controllers. An ISE node that can't resolve them can't join the domain, and the failure appears in `ad_agent.log` as something that looks like a Kerberos problem.

**Profiling can use DNS.** The reverse lookup probe uses PTR records, so it's only as useful as your reverse zone hygiene.

---

DNS is infrastructure that everything assumes and few people monitor. When something breaks in a way that makes no sense, check it second — after the obvious thing, before the complicated thing. It's right more often than it has any right to be.
