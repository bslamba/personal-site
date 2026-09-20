---
title: "NAT and PAT: Inside, Outside, Local, Global — and Why the Translation Happens in That Order"
excerpt: "Four terms that sound interchangeable and are not. Get them straight and NAT becomes obvious; get them wrong and you will configure the right thing on the wrong interface for years. Plus the order of operations that decides whether your ACL matches before or after translation."
date: "2026-09-14"
tags: ["NAT", "PAT", "IPv4", "Routing", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 4.1 *Configure and verify inside source NAT using static and pools*. ENCOR 350-401 — 3.3.b *Configure NAT/PAT*.

## Cheat sheet

| Term | Whose address | Seen from |
|---|---|---|
| **Inside local** | Your host | Inside. The real private address, e.g. `10.1.1.10`. |
| **Inside global** | Your host | Outside. What the internet sees, e.g. `203.0.113.5`. |
| **Outside global** | Their host | Outside. The real public address, e.g. `8.8.8.8`. |
| **Outside local** | Their host | Inside. Usually identical to outside global. |

**Inside/outside = whose network. Local/global = which side you are standing on.**

| | |
|---|---|
| **Static NAT** | One-to-one, permanent. For servers that must be reachable inbound. |
| **Dynamic NAT** | Many-to-many from a pool. Runs out when the pool does. |
| **PAT / overload** | Many-to-one using ports. What everybody actually uses. |
| **PAT capacity** | ~65,000 ports per global address, minus reserved. |
| **Order, inside→outside** | routing decision → **then** translate |
| **Order, outside→inside** | **translate** → then routing decision |
| **Key commands** | `ip nat inside` / `ip nat outside` on interfaces — nothing works without them |

---

## The four terms, once and properly

Almost everyone learns NAT twice: once badly, then again after being confused by `outside local`. The confusion comes from treating the four terms as a list to memorise instead of a two-by-two grid.

There are only two questions:

1. **Whose address is it?** A host on your network is **inside**. A host on the internet is **outside**. This never changes. It is about ownership, not direction of traffic.
2. **Where are you standing when you look at it?** On the private side is **local**. On the public side is **global**.

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The four NAT address terms shown as a grid across the NAT router">
  <style>.sv1 .n{fill:#17171A}.sv1 .nat{fill:#D3002D}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .l{stroke:#8A8A93;stroke-width:1.5}.sv1 .div{stroke:#D3002D;stroke-width:1.5;stroke-dasharray:5 4}.sv1 .h{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:800;fill:#D3002D}.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .a{font-family:ui-monospace,monospace;font-size:11px;font-weight:700;fill:#17171A}
  </style>
  <text class="h" x="150" y="22" text-anchor="middle">INSIDE  (local view)</text>
  <text class="h" x="500" y="22" text-anchor="middle">OUTSIDE  (global view)</text>
  <line class="div" x1="320" y1="32" x2="320" y2="212"/>
  <rect class="n" x="30" y="60" width="90" height="32" rx="3"/><text class="nt" x="75" y="81" text-anchor="middle">PC</text>
  <line class="l" x1="120" y1="76" x2="270" y2="76"/>
  <rect class="nat" x="270" y="58" width="100" height="36" rx="3"/><text class="nt" x="320" y="81" text-anchor="middle">NAT</text>
  <line class="l" x1="370" y1="76" x2="520" y2="76"/>
  <rect class="n" x="520" y="60" width="96" height="32" rx="3"/><text class="nt" x="568" y="81" text-anchor="middle">server</text>
  <text class="s" x="150" y="124">your host, seen from inside</text>
  <text class="a" x="150" y="140">inside local  10.1.1.10</text>
  <text class="s" x="490" y="124">your host, seen from outside</text>
  <text class="a" x="490" y="140">inside global  203.0.113.5</text>
  <text class="s" x="150" y="174">their host, seen from inside</text>
  <text class="a" x="150" y="190">outside local  8.8.8.8</text>
  <text class="s" x="490" y="174">their host, seen from outside</text>
  <text class="a" x="490" y="190">outside global  8.8.8.8</text>
  <text class="s" x="320" y="216" text-anchor="middle">same host, two names · which name depends on where you stand</text>
</svg>
<figcaption><b>Figure 2.</b> Each host has two names. The router translates between the left column and the right one.</figcaption>
</figure>

**Outside local and outside global are usually the same address**, which is why people find `outside local` pointless. It exists for the case where you also translate *their* addresses on the way in — overlapping address space after a company merger, where both sides use `10.1.1.0/24` and you must present a fake version of theirs to your hosts. Rare, real, and the reason the fourth box is on the grid.

---

## The three kinds

### Static NAT — one to one

```cisco
ip nat inside source static 10.1.1.20 203.0.113.20
```

A permanent, bidirectional mapping. The web server at `10.1.1.20` is always `203.0.113.20`, and traffic initiated from outside reaches it. Use it for anything that must accept inbound connections.

Port-level static, when you have one public address and several internal servers:

```cisco
ip nat inside source static tcp 10.1.1.20 80  203.0.113.5 80  extendable
ip nat inside source static tcp 10.1.1.21 443 203.0.113.5 443 extendable
```

### Dynamic NAT — many to many

```cisco
ip nat pool PUBLIC 203.0.113.10 203.0.113.20 netmask 255.255.255.0
access-list 1 permit 10.1.1.0 0.0.0.255
ip nat inside source list 1 pool PUBLIC
```

Each inside host that sends traffic gets an address from the pool, held until it times out (24 hours by default). Eleven addresses means **eleven hosts at a time**. The twelfth gets nothing and its packets are dropped. Dynamic NAT without overload is almost never what you want.

### PAT — many to one

```cisco
! Using a pool
ip nat inside source list 1 pool PUBLIC overload

! Using the interface address — the common case
ip nat inside source list 1 interface GigabitEthernet0/1 overload
```

One word, `overload`, changes everything: the router now also rewrites the **source port**, so thousands of hosts share one address. The translation table keys on the full tuple — inside local address, inside local port, inside global address, inside global port — which is what makes return traffic unambiguous.

```text
R1# show ip nat translations
Pro Inside global        Inside local       Outside local      Outside global
tcp 203.0.113.5:1024     10.1.1.10:49152    142.250.183.4:443  142.250.183.4:443
tcp 203.0.113.5:1025     10.1.1.11:51200    142.250.183.4:443  142.250.183.4:443
tcp 203.0.113.5:1026     10.1.1.10:49153    93.184.216.34:80   93.184.216.34:80
```

Three sessions, one public address, distinguished purely by the inside global port. Rows one and two are two different hosts reaching the same server — identical everywhere except the port in column two.

<div class="why">
<b>Why PAT broke the internet's architecture, usefully</b>
IPv4 ran out of addresses around 2011. PAT is the reason that did not end the internet: it lets an entire organisation live behind one address. The cost is that the network is no longer end-to-end. An inside host cannot be reached unless it speaks first, because no translation entry exists until it does. That is a security side effect people came to rely on, and it is also why peer-to-peer, VoIP and games need STUN, TURN or ICE to work at all — protocols invented purely to defeat the thing NAT does.
</div>

---

### The same packet, before and after

Capture on the inside interface and the outside interface at once and you can see precisely what NAT rewrites — and, more usefully, what it does not.

<div class="cap">
<div class="cap-head">Capture · TCP SYN, 10.1.1.50 to 203.0.113.5:443 <span class="cap-filter">tcp.flags.syn == 1</span></div>
<div class="cap-hex"><pre>BEFORE — inside interface
0000  45 00 00 28 4e 21 40 00  <mark>80</mark> 06 <mark>65 76</mark> <mark>0a 01 01 32</mark>   E..(N!@...ev...2
0010  cb 00 71 05 c7 38 01 bb  1a 2b 3c 4d 00 00 00 00   ..q..8...+&lt;M....
0020  50 02 20 00 <mark>29 3e</mark> 00 00                          P. .)&gt;..

AFTER — outside interface
0000  45 00 00 28 4e 21 40 00  <mark>7f</mark> 06 <mark>47 6e</mark> <mark>c6 33 64 07</mark>   E..(N!@...Gn.3d.
0010  cb 00 71 05 c7 38 01 bb  1a 2b 3c 4d 00 00 00 00   ..q..8...+&lt;M....
0020  50 02 20 00 <mark>0a 36</mark> 00 00                          P. ..6..</pre></div>
<div class="cap-note"><b>31 of 40 bytes are identical.</b> Exactly nine change, and every one of them is forced:
<br><br><code>0a 01 01 32</code> → <code>c6 33 64 07</code> — the source address, 10.1.1.50 becoming 198.51.100.7. That is the translation itself.
<br><code>80</code> → <code>7f</code> — the TTL, decremented by one, because this was <b>routed</b>, not bridged. NAT happens on a router.
<br><code>65 76</code> → <code>47 6e</code> — the IP header checksum, recalculated because the header changed.
<br><code>29 3e</code> → <code>0a 36</code> — the <b>TCP</b> checksum, recalculated because the TCP pseudo-header includes the source IP address.
<br><br><b>What does not change is the interesting part.</b> The IP identification field <code>4e 21</code>, the source port <code>c7 38</code> (51000), the destination <code>cb 00 71 05</code>, the sequence number <code>1a 2b 3c 4d</code> — all untouched. That last one matters: NAT rewriting a TCP checksum but not the sequence number is why it is transparent to TCP, and why any protocol that carries an IP address <em>inside its payload</em> — FTP, SIP, H.323 — breaks without an application-layer gateway to fix it up.</div>
</div>

## The two commands that make it work, and the one that does not

<div class="cmd">
<div class="cmd-line"><span class="t">ip nat inside source list</span> <span class="opt">1</span> <span class="t">interface</span> <span class="opt">GigabitEthernet0/1</span> <span class="t">overload</span>
<span class="t">access-list</span> <span class="opt">1</span> <span class="t">permit</span> <span class="opt">10.1.1.0 0.0.0.255</span>
!
interface GigabitEthernet0/0
 <span class="t">ip nat inside</span>
interface GigabitEthernet0/1
 <span class="t">ip nat outside</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip nat <b>inside</b> source</dt><dd>Translate the <b>source</b> address of packets arriving on an <b>inside</b> interface. Both words are directional and both matter. The mirror command <code>ip nat outside source</code> exists and does the opposite — it is how you translate someone else's addresses coming towards you, and it is a different tool for a different problem.</dd></div>
<div><dt>list 1</dt><dd>Which traffic to translate. <b>This ACL selects, it does not filter</b> — see the warning below. A <code>deny</code> here does not block a packet; it means "send this one out untranslated", which is almost never what anybody wanted.</dd></div>
<div class="is-key"><dt>interface Gi0/1</dt><dd>Translate to <b>whatever address that interface currently has</b>, rather than to a pool. This is the right answer on a DHCP or PPPoE WAN link where the address changes — a pool would need editing every time. The alternative is <code>pool NAME</code> with <code>ip nat pool</code> defining a range.</dd></div>
<div class="is-key"><dt>overload</dt><dd>The word that turns NAT into <b>PAT</b>. Without it, one inside host consumes one global address and the rest queue for one that is free. With it, the port number becomes part of the identity and thousands of hosts share a single address. Leave it off by accident on an interface-based statement and the second user to connect simply fails.</dd></div>
<div class="is-key"><dt>ip nat inside<br>ip nat outside</dt><dd>The marks, and <b>nothing translates without them</b>. The router does not infer which side is which — it only translates packets moving between an interface marked <code>inside</code> and one marked <code>outside</code>. A correct <code>ip nat inside source</code> statement with these missing, reversed, or on the wrong interfaces is the most common NAT fault there is. Check them first, every time.</dd></div>
</dl>
</div>

**Nothing translates without these.** The router does not infer which side is which; it only translates packets moving between an interface marked `inside` and one marked `outside`.

The single most common NAT fault in the world is a correct `ip nat inside source` statement with the interface marks missing, on the wrong interfaces, or reversed. Check them first, every time.

<div class="warn">
<b>The ACL in a NAT statement selects, it does not filter</b>
<code>access-list 1 permit 10.1.1.0 0.0.0.255</code> in a NAT statement means <em>"translate traffic from this source"</em>. It is not a security policy, and <code>deny</code> in it does not block anything — it only means "do not translate this", which usually results in the packet being forwarded <b>untranslated</b> with a private source address. That leaves your network, gets dropped at the first ISP router, and looks exactly like a routing problem.
</div>

<div class="real">
<b>In the real world</b>
PAT's limit is ports, not addresses, and it arrives suddenly. One public address gives roughly <b>64,000 concurrent translations</b> in theory and far fewer in practice, because every browser tab opens several connections and every idle one holds its entry until the timeout expires — 24 hours by default for TCP, which is absurdly long. The symptom of running out is not an outage: it is <b>intermittent, user-specific failures that clear if you wait</b>, which gets misdiagnosed as an application problem for weeks. Watch <code>show ip nat statistics</code> for a rising <code>Misses</code> counter, and bring the timeouts down to something sane with <code>ip nat translation tcp-timeout 3600</code> before you buy more addresses.
</div>

---

## Order of operations — the thing that actually catches people

NAT and routing do not happen in a fixed order. They happen in **opposite orders depending on direction**, and this determines whether an ACL sees the original address or the translated one.

<div class="walk">
<div class="walk-head">Where the ACL sits in the pipeline <span class="walk-hint">click a direction</span></div>
<div class="walk-tabs">
  <input type="radio" name="natw" id="nw1" checked><label for="nw1"><span class="step-n">1</span>Inside → outside</label>
  <input type="radio" name="natw" id="nw2"><label for="nw2"><span class="step-n">2</span>Outside → inside</label>
  <input type="radio" name="natw" id="nw3"><label for="nw3"><span class="step-n">3</span>What it means</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Going from inside to outside the packet is routed first and translated last so an inbound ACL sees the private address">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <defs><marker id="nm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <text class="k" x="20" y="28" fill="#0f6b47">INSIDE &#8594; OUTSIDE — translate LAST</text>
  <rect x="20" y="56" width="96" height="28" rx="3" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="m" x="68.0" y="74" text-anchor="middle">inbound ACL</text>
  <line x1="118" y1="70" x2="132" y2="70" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#nm)"/>
  <rect x="134" y="56" width="80" height="28" rx="3" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="m" x="174.0" y="74" text-anchor="middle">routing</text>
  <line x1="216" y1="70" x2="230" y2="70" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#nm)"/>
  <rect x="232" y="56" width="62" height="28" rx="3" fill="rgba(211,0,45,.14)" stroke="#D3002D"/>
  <text class="m" x="263.0" y="74" text-anchor="middle">NAT</text>
  <line x1="296" y1="70" x2="310" y2="70" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#nm)"/>
  <rect x="312" y="56" width="104" height="28" rx="3" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="m" x="364.0" y="74" text-anchor="middle">outbound ACL</text>
  <text class="s" x="20" y="108">The ACL on the inside interface is evaluated <tspan font-weight="700">before</tspan> translation.</text>
  <text class="k" x="20" y="134" fill="#0f6b47">So an inbound ACL here must match the INSIDE LOCAL address — 10.1.1.50.</text>
  <text class="s" x="20" y="158">Write it against the public address and it will never match anything.</text>
</svg>
<p class="walk-say"><span class="walk-title">Outbound: routed first, translated last</span>
The router decides where the packet is going <b>before</b> it rewrites the source. So anything you attach to the inside interface — an ACL, a policy route, a class-map — sees the <b>original private address</b>.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coming from outside to inside the packet is translated first and routed afterwards so an inbound ACL sees the public address">
  <style>.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <defs><marker id="nm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <text class="k" x="20" y="28" fill="#B80027">OUTSIDE &#8594; INSIDE — translate FIRST</text>
  <rect x="20" y="56" width="96" height="28" rx="3" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="m" x="68.0" y="74" text-anchor="middle">inbound ACL</text>
  <line x1="118" y1="70" x2="132" y2="70" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#nm)"/>
  <rect x="134" y="56" width="62" height="28" rx="3" fill="rgba(211,0,45,.14)" stroke="#D3002D"/>
  <text class="m" x="165.0" y="74" text-anchor="middle">NAT</text>
  <line x1="198" y1="70" x2="212" y2="70" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#nm)"/>
  <rect x="214" y="56" width="80" height="28" rx="3" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="m" x="254.0" y="74" text-anchor="middle">routing</text>
  <line x1="296" y1="70" x2="310" y2="70" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#nm)"/>
  <rect x="312" y="56" width="104" height="28" rx="3" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="m" x="364.0" y="74" text-anchor="middle">outbound ACL</text>
  <text class="s" x="20" y="108">Translation happens <tspan font-weight="700">before</tspan> routing, but still <tspan font-weight="700">after</tspan> the inbound ACL.</text>
  <text class="k" x="20" y="134" fill="#B80027">So an inbound ACL here must match the INSIDE GLOBAL address — 198.51.100.7.</text>
  <text class="s" x="20" y="158">This is the exact opposite of the other direction, on the same router, for the same session.</text>
</svg>
<p class="walk-say"><span class="walk-title">Inbound: translated first, routed afterwards</span>
Coming the other way the router must undo the translation before it can know which internal host to route to. The inbound ACL still runs first, so it sees the <b>public</b> address — the one the outside world used.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The same ACL written against the wrong address in each direction never matches">
  <style>.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .ok{fill:rgba(31,157,107,.12);stroke:#1f9d6b}.sv4 .no{fill:#FFF1F3;stroke:#D3002D}</style>
  <text class="k" x="20" y="26">THE SAME SESSION, TWO DIRECTIONS, TWO DIFFERENT ADDRESSES</text>
  <rect class="ok" x="20" y="42" width="286" height="54"/>
  <text class="s" x="32" y="62" font-weight="700" fill="#0f6b47">on the INSIDE interface, in</text>
  <text class="m" x="32" y="84">permit ip host 10.1.1.50 any</text>
  <rect class="no" x="334" y="42" width="286" height="54"/>
  <text class="s" x="346" y="62" font-weight="700" fill="#B80027">on the OUTSIDE interface, in</text>
  <text class="m" x="346" y="84">permit ip any host 198.51.100.7</text>
  <text class="s" x="20" y="126">Swap those two and both silently match nothing. The ACL is syntactically perfect, the</text>
  <text class="s" x="20" y="144">counters stay at zero, and the traffic is dropped by the implicit deny at the end.</text>
  <text class="k" x="20" y="176" fill="#D3002D">&#8220;My ACL is right and the traffic is still blocked&#8221; is nearly always this.</text>
</svg>
<p class="walk-say"><span class="walk-title">Which is why the four terms matter</span>
This is the practical payoff of the inside-local / inside-global vocabulary. An ACL, a policy route or a QoS class-map has to be written against <b>the address that exists at that point in the pipeline</b>, and that address is different in each direction.
<br><br>The diagnostic is always the same: <code>show access-lists</code> and look at the match counters. Zero matches on a rule you are certain is correct means you have written it against the wrong side of the translation.</p>
</div>
</div>
</div>


<figure class="fig">
<svg class="sv5" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NAT order of operations differs by direction">
  <style>.sv5 .b{fill:#fff;stroke:#232327;stroke-width:1.4}.sv5 .bn{fill:#D3002D;stroke:#D3002D}.sv5 .t{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#17171A}.sv5 .tw{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#fff}.sv5 .h{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:800}.sv5 .ar{stroke:#8A8A93;stroke-width:1.5;marker-end:url(#m)}
  </style>
  <defs><marker id="m" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <text class="h" x="20" y="28" fill="#1f9d6b">INSIDE → OUTSIDE</text>
  <rect class="b" x="20" y="40" width="96" height="30" rx="3"/><text class="t" x="68" y="60" text-anchor="middle">inbound ACL</text>
  <line class="ar" x1="118" y1="55" x2="146" y2="55"/>
  <rect class="b" x="148" y="40" width="96" height="30" rx="3"/><text class="t" x="196" y="60" text-anchor="middle">routing</text>
  <line class="ar" x1="246" y1="55" x2="274" y2="55"/>
  <rect class="b bn" x="276" y="40" width="96" height="30" rx="3"/><text class="tw" x="324" y="60" text-anchor="middle">TRANSLATE</text>
  <line class="ar" x1="374" y1="55" x2="402" y2="55"/>
  <rect class="b" x="404" y="40" width="110" height="30" rx="3"/><text class="t" x="459" y="60" text-anchor="middle">outbound ACL</text>
  <text class="h" x="20" y="120" fill="#D3002D">OUTSIDE → INSIDE</text>
  <rect class="b" x="20" y="132" width="96" height="30" rx="3"/><text class="t" x="68" y="152" text-anchor="middle">inbound ACL</text>
  <line class="ar" x1="118" y1="147" x2="146" y2="147"/>
  <rect class="b bn" x="148" y="132" width="96" height="30" rx="3"/><text class="tw" x="196" y="152" text-anchor="middle">TRANSLATE</text>
  <line class="ar" x1="246" y1="147" x2="274" y2="147"/>
  <rect class="b" x="276" y="132" width="96" height="30" rx="3"/><text class="t" x="324" y="152" text-anchor="middle">routing</text>
  <line class="ar" x1="374" y1="147" x2="402" y2="147"/>
  <rect class="b" x="404" y="132" width="110" height="30" rx="3"/><text class="t" x="459" y="152" text-anchor="middle">outbound ACL</text>
  <text class="t" x="560" y="60">ACL in sees LOCAL</text>
  <text class="t" x="560" y="152">ACL in sees GLOBAL</text>
</svg>
<figcaption><b>Figure 3.</b> Translation sits after routing going out and before routing coming in. An inbound ACL therefore matches different addresses depending on which interface it is on.</figcaption>
</figure>

The practical consequence, and it is the one people get wrong:

**An inbound ACL on the outside interface must permit the inside GLOBAL address** — the public one — because translation has not happened yet when the ACL is evaluated. Write `permit tcp any host 10.1.1.20 eq 80` there and it will never match, because no packet arriving from the internet has ever had `10.1.1.20` in it.

---

## What goes wrong

**Nothing translates at all.** `show ip nat translations` is empty. Check `ip nat inside` and `ip nat outside` on the interfaces first — this is the cause more often than everything else combined. `show ip nat statistics` shows which interfaces are marked.

**Translations exist but there is no return traffic.** The outside world has no route back to your inside global address, or your ISP is not routing that block to you. Check from outside.

**It works for some hosts and not others.** The ACL selecting traffic does not cover all of them, or the pool is exhausted. `show ip nat statistics` reports misses.

**It worked, then stopped under load.** PAT port exhaustion. One global address is ~65,000 ports, and a single browser tab can open dozens. `show ip nat statistics` counts misses; add addresses to the pool.

**Inbound connections to a static NAT fail.** The inbound ACL on the outside interface is matching the inside local address instead of the inside global. See the order of operations above.

**Everything works except one application.** Protocols that embed IP addresses in their payload — FTP active mode, SIP, H.323, some VPN protocols — break under NAT unless an application-level gateway rewrites the payload too. `ip nat service` controls these.

---

<div class="lab">
<div class="lab-head">Lab — all three NAT types, and the order of operations proved</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Configure static NAT, dynamic NAT and PAT on the same router; read the translation table well enough to explain any row in it; exhaust a dynamic pool deliberately so you recognise the symptom; and prove experimentally which address an ACL sees on each interface.</div>

**Topology.** R1 is the NAT router. Inside: a switch with PC1 `10.1.1.10`, PC2 `10.1.1.11`, and a server `10.1.1.20`. Outside: R2 acting as the ISP, with a loopback `8.8.8.8` to represent the internet. R1's outside interface is `203.0.113.5/24`. R2 has a static route for `203.0.113.0/24` only — **no route to 10.1.1.0/24**, which is the point.

<p class="lab-step"><span class="n">1</span>Prove it is broken first</p>

Before configuring NAT, ping `8.8.8.8` from PC1. It fails. On R2, `debug ip packet` briefly — you will see packets arriving with source `10.1.1.10` and no route back. **Understand this failure before you fix it**; it is what NAT exists to prevent.

<p class="lab-step"><span class="n">2</span>Mark the interfaces</p>

```cisco
interface GigabitEthernet0/0
 ip nat inside
interface GigabitEthernet0/1
 ip nat outside
```

Confirm with `show ip nat statistics` — the Inside interfaces and Outside interfaces lines should both be populated.

<p class="lab-step"><span class="n">3</span>PAT to the interface address</p>

```cisco
access-list 10 permit 10.1.1.0 0.0.0.255
ip nat inside source list 10 interface GigabitEthernet0/1 overload
```

Ping `8.8.8.8` from PC1 and PC2 at once. Then `show ip nat translations`.

<div class="lab-watch"><b>Things to notice</b>
Both hosts appear with the <em>same</em> inside global address and <em>different</em> inside global ports. That port is the only thing distinguishing them, and it is how the router knows which host a returning packet belongs to. Note that ICMP entries show an identifier rather than a port — same idea, different field.</div>

<p class="lab-step"><span class="n">4</span>Static NAT for the server</p>

```cisco
ip nat inside source static 10.1.1.20 203.0.113.20
```

From R2, ping `203.0.113.20`. It should succeed — this is traffic **initiated from outside**, which PAT alone can never support. Check the translation table and note the static entry is present even with no traffic flowing.

<p class="lab-step"><span class="n">5</span>Dynamic NAT, then break it on purpose</p>

```cisco
no ip nat inside source list 10 interface GigabitEthernet0/1 overload
ip nat pool SMALL 203.0.113.30 203.0.113.31 netmask 255.255.255.0
ip nat inside source list 10 pool SMALL
```

A pool of **two**. Ping out from PC1 and PC2 — both work. Now add a third host, or ping from R1's inside interface as a third source, and watch it fail.

<div class="lab-watch"><b>Things to notice</b>
<code>show ip nat statistics</code> increments a <b>misses</b> counter. The packet is dropped, not queued. Now add <code>overload</code> to the same statement and watch all three work from the same two addresses — that one word is the entire difference between dynamic NAT and PAT.</div>

<p class="lab-step"><span class="n">6</span>Prove the order of operations</p>

This is the step worth doing slowly.

```cisco
! Apply INBOUND on the OUTSIDE interface, matching the INSIDE LOCAL address
ip access-list extended TEST-LOCAL
 permit ip any host 10.1.1.20
interface GigabitEthernet0/1
 ip access-group TEST-LOCAL in
```

From R2, ping `203.0.113.20`. It **fails**, and `show ip access-lists TEST-LOCAL` shows **zero matches**. Now swap it:

```cisco
ip access-list extended TEST-GLOBAL
 permit ip any host 203.0.113.20
interface GigabitEthernet0/1
 ip access-group TEST-GLOBAL in
```

Ping again. It works and the counters increment.

<div class="lab-watch"><b>Things to notice</b>
You have just proved that on the outside interface, inbound, translation has <em>not yet happened</em> — the ACL sees the global address. Reverse the experiment on the inside interface and you will find the opposite. Write the two results down; this is the part of NAT that is almost never demonstrated and almost always assumed.</div>

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Nothing translates and the table is empty</b> — the interface marks are missing or reversed. Always check <code>show ip nat statistics</code> before anything else.</li>
<li><b>Static NAT works outbound but not inbound</b> — R2 has no route to <code>203.0.113.20</code>. Add one, or use an address inside a subnet R2 already routes.</li>
<li><b>Old translations interfere after a config change</b> — entries persist. <code>clear ip nat translation *</code> between steps, or you will debug a stale table.</li>
<li><b>Pings work but the translation table looks empty</b> — ICMP entries time out in 60 seconds. Look while the ping is running, or use <code>ping ... repeat 100</code>.</li>
<li><b>The ACL denies and traffic still leaves</b> — with an untranslated private source. A NAT ACL selects; it does not filter. Watch for it at the ISP edge.</li>
<li><b>You cannot ping the inside global address from the NAT router itself</b> — traffic sourced by the router does not traverse inside-to-outside. Test from a host.</li>
</ul></div>

<p class="lab-step"><span class="n">7</span>Capture it</p>

Mirror both R1 interfaces to Wireshark. Ping from PC1 to `8.8.8.8` and capture on each side. Put the two captures side by side and identify, in the actual packet bytes: the source IP on the inside, the source IP on the outside, and — for a TCP session rather than ICMP — the source port changing. Confirm the destination address is identical on both sides.

<div class="lab-earned"><b>What you earned</b>
You can place any address into the four-box grid on sight, and explain why outside local usually equals outside global. You know that PAT differs from dynamic NAT by one keyword, and you have seen a pool exhaust. You can point at the row in the translation table that explains any given flow. Most importantly, you have <em>measured</em> the order of operations rather than memorised it — so when an inbound ACL on an outside interface does not match, you will know within seconds that it is looking at the wrong address.</div>

</div>
</div>

---

### What a working translation looks like

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — the table, and the counters that prove it is being used</div>
<pre><span class="p">R1#</span> <span class="c">show ip nat translations</span>
Pro  Inside global        Inside local         Outside local        Outside global
tcp  <span class="y">198.51.100.7:51000</span>   <span class="y">10.1.1.50:51000</span>      203.0.113.5:443      203.0.113.5:443
tcp  198.51.100.7:51001   10.1.1.51:1287       203.0.113.5:443      203.0.113.5:443
---  198.51.100.9         10.1.1.9             ---                  ---

<span class="o">! Row 1: PAT kept the original port because it was free.</span>
<span class="o">! Row 2: it was not free, so the port was rewritten 1287 -> 51001. That rewrite is</span>
<span class="o">!        the entire difference between NAT and PAT.</span>
<span class="o">! Row 3: a static entry. No protocol, no ports, and it exists with no traffic at all.</span>

<span class="p">R1#</span> <span class="c">show ip nat statistics</span>
Total active translations: 3 (1 static, 2 dynamic; <span class="y">2 extended</span>)
Outside interfaces: GigabitEthernet0/1
Inside interfaces:  GigabitEthernet0/0
Hits: 48211  <span class="r">Misses: 0</span>
<span class="o">! "Misses" counts packets that needed a translation and could not get one —</span>
<span class="o">! a pool that has run out. If this climbs, users see intermittent failures.</span>

<span class="p">R1#</span> <span class="c">show ip nat translations verbose | include timeout</span>
    create 00:04:12, use 00:00:03 timeout:<span class="y">86400000</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Read the table right to left when you are troubleshooting.</b> An entry that exists proves the router decided to translate; if traffic still fails, the fault is routing or an ACL, not NAT. An entry that <em>does not</em> exist means the packet never matched — wrong interface marked inside or outside, or the ACL does not match the source. <code>show ip nat statistics</code> settles which, because the hit counter moves only when a translation is actually used.</p>

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>A PC at 10.1.1.10 is translated to 203.0.113.5 when reaching 8.8.8.8. What is 203.0.113.5 called?</p>
<label class="qz-opt"><input type="radio" name="n1"><span>Outside global</span><em class="qz-fb qz-bad">Outside refers to <em>their</em> host. This address represents your PC.</em></label>
<label class="qz-opt"><input type="radio" name="n1"><span>Inside global</span><em class="qz-fb qz-good">Correct. Inside because it is your host; global because it is how the outside world sees it.</em></label>
<label class="qz-opt"><input type="radio" name="n1"><span>Inside local</span><em class="qz-fb qz-bad">That is 10.1.1.10 — your host as seen from inside.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Static NAT maps 10.1.1.20 to 203.0.113.20. An inbound ACL on the outside interface should permit which address?</p>
<label class="qz-opt"><input type="radio" name="n2"><span>10.1.1.20 — that is the real server</span><em class="qz-fb qz-bad">Translation happens <em>after</em> the inbound ACL on an outside interface. No arriving packet contains 10.1.1.20, so the entry never matches.</em></label>
<label class="qz-opt"><input type="radio" name="n2"><span>203.0.113.20 — translation has not happened yet</span><em class="qz-fb qz-good">Right. Outside→inside is ACL, then translate, then route. The ACL sees the global address.</em></label>
<label class="qz-opt"><input type="radio" name="n2"><span>Either works — NAT handles it</span><em class="qz-fb qz-bad">It does not. One matches and one silently never does.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A pool holds 10 addresses, configured without <code>overload</code>. The 11th host sends traffic. What happens?</p>
<label class="qz-opt"><input type="radio" name="n3"><span>It shares an address using a different port</span><em class="qz-fb qz-bad">That is PAT, and it requires the overload keyword.</em></label>
<label class="qz-opt"><input type="radio" name="n3"><span>Its packets are dropped and the misses counter increments</span><em class="qz-fb qz-good">Correct. Dynamic NAT is one-to-one; when the pool is exhausted there is nothing to assign.</em></label>
<label class="qz-opt"><input type="radio" name="n3"><span>It is forwarded untranslated</span><em class="qz-fb qz-bad">That happens when the ACL does not select it — a different failure with a different symptom.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span><code>show ip nat translations</code> is completely empty and no host can reach the internet. What do you check first?</p>
<label class="qz-opt"><input type="radio" name="n4"><span>Whether <code>ip nat inside</code> and <code>ip nat outside</code> are on the right interfaces</span><em class="qz-fb qz-good">Yes — by a wide margin the most common NAT fault. The router only translates between an interface marked inside and one marked outside.</em></label>
<label class="qz-opt"><input type="radio" name="n4"><span>Whether the pool has enough addresses</span><em class="qz-fb qz-bad">Exhaustion produces misses, not a completely empty table.</em></label>
<label class="qz-opt"><input type="radio" name="n4"><span>Whether the ISP is routing your block</span><em class="qz-fb qz-bad">That breaks return traffic, but translations would still be created.</em></label>
</div>

---

## References

- **RFC 3022** — Traditional IP Network Address Translator (Traditional NAT).
- **RFC 2663** — IP Network Address Translator Terminology and Considerations.
- **RFC 1918** — Address Allocation for Private Internets.
- **RFC 6888** — Common Requirements for Carrier-Grade NATs.
- Cisco — [NAT: Local and Global Definitions](https://www.cisco.com/c/en/us/support/docs/ip/network-address-translation-nat/4606-8.html)
- Cisco — [Configuring Network Address Translation: Getting Started](https://www.cisco.com/c/en/us/support/docs/ip/network-address-translation-nat/13772-12.html)

---

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
