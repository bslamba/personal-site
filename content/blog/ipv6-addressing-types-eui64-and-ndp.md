---
title: "IPv6 Addressing: The Types, EUI-64, Solicited-Node, and How a Host Gets an Address Without DHCP"
excerpt: "IPv6 is not IPv4 with longer addresses. Every interface has several addresses at once and is supposed to. There is no broadcast and no ARP. A host can configure itself, discover its router and detect a duplicate without any server existing. Here is the address plan, the two bit-manipulations worth knowing by hand, and the four ICMPv6 messages that replaced everything IPv4 did with broadcasts."
date: "2026-09-17"
tags: ["IPv6", "NDP", "SLAAC", "EUI-64", "Addressing", "CCNA", "Fundamentals"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 1.8 *Configure and verify IPv6 addressing and prefix* and 1.9 *Describe IPv6 address types: unicast (global, unique local, link local), anycast, multicast, modified EUI-64*.

## Cheat sheet

| Range | Type | Notes |
|---|---|---|
| `2000::/3` | **Global unicast** | Routable on the internet. `2000`–`3FFF` |
| `FC00::/7` | **Unique local** | RFC 4193. In practice always `FD00::/8` |
| `FE80::/10` | **Link-local** | **Mandatory on every interface.** Never routed |
| `FF00::/8` | **Multicast** | Replaces broadcast entirely |
| `::/128` | Unspecified | Source during DAD |
| `::1/128` | Loopback | The whole of `127.0.0.0/8` in one address |
| `::/0` | Default route | |

| Well-known multicast | |
|---|---|
| `FF02::1` | All nodes — the closest thing to broadcast |
| `FF02::2` | All routers |
| `FF02::5` / `FF02::6` | OSPFv3 all / DR routers |
| `FF02::9` | RIPng |
| `FF02::A` | EIGRP for IPv6 |
| `FF02::1:2` | DHCPv6 relay agents and servers |
| `FF02::1:FFxx:xxxx` | **Solicited-node** — low 24 bits of the unicast address |

| ICMPv6 / NDP | Type | Replaces |
|---|---|---|
| Router Solicitation | **133** | — |
| Router Advertisement | **134** | DHCP's default gateway |
| Neighbour Solicitation | **135** | **ARP request** |
| Neighbour Advertisement | **136** | ARP reply |

**Two things that catch IPv4 engineers.** There is **no broadcast** — every "send to everyone" job is done by a multicast group. And an interface is expected to hold **several addresses at once**: a link-local, usually a global, and a solicited-node group for each. That is normal, not a misconfiguration.

---

## The address plan

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 235" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The IPv6 address space divided into global unicast, unique local, link local and multicast ranges">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}
  </style>
  <text class="hdr" x="14" y="20">THE FOUR YOU WILL ACTUALLY MEET</text>
  <rect x="14" y="30" width="612" height="40" fill="rgba(31,157,107,.12)" stroke="#1f9d6b"/>
  <text class="m" x="26" y="48" fill="#0f6b47">2000::/3</text>
  <text class="k" x="140" y="48" fill="#0f6b47">GLOBAL UNICAST</text>
  <text class="s" x="300" y="48">routable, assigned by your RIR or ISP — the public internet</text>
  <text class="s" x="26" y="64">first three bits 001 · so anything starting 2 or 3</text>
  <rect x="14" y="78" width="612" height="40" fill="rgba(242,153,74,.14)" stroke="#F2994A"/>
  <text class="m" x="26" y="96" fill="#B26014">FD00::/8</text>
  <text class="k" x="140" y="96" fill="#B26014">UNIQUE LOCAL</text>
  <text class="s" x="300" y="96">private, like RFC 1918 — but you randomise 40 bits of it</text>
  <text class="s" x="26" y="112">FC00::/7 on paper; the L bit is always 1, so always FD in practice</text>
  <rect x="14" y="126" width="612" height="40" fill="rgba(75,123,236,.12)" stroke="#4b7bec"/>
  <text class="m" x="26" y="144" fill="#2b5ab8">FE80::/10</text>
  <text class="k" x="140" y="144" fill="#2b5ab8">LINK-LOCAL</text>
  <text class="s" x="300" y="144">every interface has one, automatically, always</text>
  <text class="s" x="26" y="160">never routed · this is what routing protocols and NDP actually use</text>
  <rect x="14" y="174" width="612" height="40" fill="rgba(211,0,45,.10)" stroke="#D3002D"/>
  <text class="m" x="26" y="192" fill="#B80027">FF00::/8</text>
  <text class="k" x="140" y="192" fill="#B80027">MULTICAST</text>
  <text class="s" x="300" y="192">there is no broadcast. Every group job is a multicast group</text>
  <text class="s" x="26" y="208">FF02:: is link-local scope — the second nibble is the scope</text>
  <text class="k" x="320" y="230" text-anchor="middle">Anycast is not a range. It is an ordinary unicast address configured on several devices at once.</text>
</svg>
<figcaption><b>Figure 1.</b> Four prefixes cover almost everything you will see. The one that surprises people is link-local — it is not optional, it is not configured, and it is the address your routing protocols are actually using.</figcaption>
</figure>

<div class="why">
<b>Why link-local matters more than it looks</b>
Every IPv6 interface generates an <code>FE80::/64</code> address the moment it comes up, with or without any configuration. It is never routed — a packet with a link-local source or destination must not leave the segment. And it is what <b>NDP, OSPFv3, EIGRPv6 and RA all use as their source</b>.
<br><br>The practical consequence: a router's IPv6 next hop in the routing table is almost always a <code>FE80::</code> address, not a global one. That looks wrong to an IPv4 engineer and is entirely correct. It also means the next hop is only meaningful <em>on that interface</em>, which is why IPv6 route and neighbour output always names an interface alongside the address.
</div>

### Writing them down

Two compression rules, and you may apply the second only once.

```text
2001:0db8:0000:0000:0000:ff00:0042:8329     the full 128 bits

2001:db8:0:0:0:ff00:42:8329                 rule 1 — drop leading zeros in each group
2001:db8::ff00:42:8329                      rule 2 — one run of all-zero groups becomes ::

2001:db8::ff00:0:0:8329                     ILLEGAL — two :: is ambiguous
2001::db8::8329                             ILLEGAL — same reason
```

**Why only one `::`.** The `::` means "as many zero groups as it takes to reach 128 bits". With two of them there is no way to know how many belong to each, so the address cannot be reconstructed. A device will reject it.

---

## The two bit-manipulations worth doing by hand

### Modified EUI-64 — a MAC becomes an interface ID

<figure class="fig">
<svg class="sv2" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A 48-bit MAC address is split, FFFE is inserted in the middle, and the seventh bit is flipped to produce a 64-bit interface identifier">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv2 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}.sv2 .ins{fill:rgba(242,153,74,.20);stroke:#F2994A}.sv2 .flip{fill:rgba(211,0,45,.14);stroke:#D3002D}
  </style>
  <text class="hdr" x="14" y="20">1 · THE MAC, 48 BITS</text>
  <text class="m" x="14" y="42">00:1a:2b : 3c:4d:5e</text>
  <text class="s" x="14" y="58">OUI — the vendor</text>
  <text class="s" x="120" y="58">device-specific</text>
  <text class="hdr" x="14" y="88">2 · SPLIT IN HALF, INSERT FFFE</text>
  <text class="m" x="14" y="110">00:1a:2b:</text>
  <rect class="ins" x="98" y="96" width="52" height="20"/>
  <text class="m" x="102" y="110" fill="#B26014">ff:fe</text>
  <text class="m" x="154" y="110">:3c:4d:5e</text>
  <text class="s" x="98" y="128" fill="#B26014">16 bits that mark this as MAC-derived</text>
  <text class="hdr" x="14" y="158">3 · FLIP THE SEVENTH BIT — 0x00 BECOMES 0x02</text>
  <rect class="flip" x="10" y="166" width="30" height="20"/>
  <text class="m" x="14" y="180" fill="#B80027">02</text>
  <text class="m" x="44" y="180">:1a:2b:ff:fe:3c:4d:5e</text>
  <text class="s" x="14" y="200">0000 0000 → 0000 0010. The U/L bit: 0 means &#8220;globally unique&#8221; in a MAC, 1 means it here.</text>
  <text class="k" x="380" y="180" fill="#0f6b47">2001:db8:acad:1:21a:2bff:fe3c:4d5e</text>
  <text class="s" x="380" y="200" fill="#0f6b47">and the leading zero of 021a compresses away</text>
</svg>
<figcaption><b>Figure 2.</b> Three steps, and step three is the one everybody forgets. The flipped bit is why a MAC of <code>00:...</code> produces an address starting <code>21a:</code> rather than <code>1a:</code> — the <code>2</code> is the flip.</figcaption>
</figure>

<div class="warn">
<b>EUI-64 is a privacy problem, and modern hosts do not use it</b>
An EUI-64 address embeds the MAC, so the bottom half of the address <b>follows the device between networks</b> — a perfect tracking identifier. RFC 8981 privacy extensions generate random interface IDs instead, and Windows, macOS, iOS, Android and modern Linux all default to them. So you will configure EUI-64 on <b>routers</b>, where it is predictable and convenient, and you will almost never see it on a client. If you are looking at a packet capture wondering why no host address contains <code>ff:fe</code>, that is why.
</div>

### Solicited-node multicast — how IPv6 avoids waking everybody

IPv4's ARP is a broadcast: every host on the segment processes it to discover that it is not the one being asked for. IPv6 replaces it with a multicast group derived from the **low 24 bits** of the address being looked for.

```text
target      2001:db8:acad:1:20c:29ff:feaa:bb01
                                      └──┬──┘
                            low 24 bits: aa:bb:01

solicited   ff02::1:ffaa:bb01
ethernet    33:33:ff:aa:bb:01        33:33 + the last 32 bits
```

Only hosts whose address ends in those 24 bits join that group, so in practice **one host** is interrupted instead of all of them — and the switch, if it is doing MLD snooping, only sends the frame to that port.

<div class="note">
<b>The collision, and why it is fine</b>
Only 24 bits are used, so different addresses can share a solicited-node group:
<br><br><code>2001:db8:acad:1:21a:2bff:fe3c:<b>4d5e</b></code> and <code>2001:db8::99:<b>4d5e</b></code> both map to <code>ff02::1:ff3c:4d5e</code>… no — look again. The first maps to <code>ff02::1:ff3c:4d5e</code> and the second to <code>ff02::1:ff99:4d5e</code>, because the low <b>24</b> bits are <code>3c:4d:5e</code> and <code>99:4d:5e</code>. Collisions do happen, just not from the last four hex digits alone — they need all six to match. When one occurs, both hosts receive the solicitation and the one that is not the target simply ignores it. The mechanism is an optimisation, not a guarantee.
</div>

---

## How a host gets an address with no server at all

<div class="walk">
<div class="walk-head">Cable in, address configured, router found — no DHCP anywhere <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="v6w" id="v1" checked><label for="v1"><span class="step-n">1</span>Link-local</label>
  <input type="radio" name="v6w" id="v2"><label for="v2"><span class="step-n">2</span>DAD</label>
  <input type="radio" name="v6w" id="v3"><label for="v3"><span class="step-n">3</span>Find a router</label>
  <input type="radio" name="v6w" id="v4"><label for="v4"><span class="step-n">4</span>SLAAC</label>
  <input type="radio" name="v6w" id="v5"><label for="v5"><span class="step-n">5</span>Resolve a neighbour</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 185" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The interface generates a link local address from its MAC as soon as it comes up">
  <style>.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:11px;fill:#17171A}</style>
  <rect class="n" x="40" y="60" width="130" height="36" rx="3"/><text class="nt" x="105" y="83" text-anchor="middle">HOST</text>
  <text class="m" x="200" y="70">MAC 00:1a:2b:3c:4d:5e</text>
  <text class="m" x="200" y="92" fill="#2b5ab8">fe80::21a:2bff:fe3c:4d5e</text>
  <text class="s" x="200" y="110">derived immediately, with no configuration and no network</text>
  <text class="k" x="320" y="146" text-anchor="middle" fill="#2b5ab8">This address exists before the host has spoken to anything.</text>
  <text class="s" x="320" y="168" text-anchor="middle">It is the source it will use for every message that follows — including the ones asking for a real address.</text>
</svg>
<p class="walk-say"><span class="walk-title">A link-local address, instantly</span>
The interface comes up and immediately has an <code>FE80::</code> address, built from its MAC by EUI-64 or chosen randomly. <b>No DHCP, no router, no cable even needs to be connected to anything.</b>
<br><br>This is the bootstrap that makes everything else possible: the host now has a usable source address for the messages it is about to send.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Duplicate address detection sends a neighbour solicitation for the host own address from the unspecified address">
  <style>.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700;fill:#B26014}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv4 .q{stroke:#F2994A;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="40" y="66" width="110" height="34" rx="3"/><text class="nt" x="95" y="88" text-anchor="middle">HOST</text>
  <rect class="n" x="470" y="66" width="130" height="34" rx="3" opacity=".4"/><text class="nt" x="535" y="88" text-anchor="middle">everyone else</text>
  <path class="q" d="M 150 83 L 470 83"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 150 83 L 470 83"/></circle>
  <text class="k" x="310" y="58" text-anchor="middle">NS — &#8220;does anybody already have fe80::21a:2bff:fe3c:4d5e?&#8221;</text>
  <text class="m" x="310" y="112" text-anchor="middle">source :: (unspecified) · dest ff02::1:ff3c:4d5e</text>
  <text class="s" x="320" y="146" text-anchor="middle">The source is <tspan font-family="ui-monospace,Menlo,monospace">::</tspan> because the host is not allowed to use an address it has not yet verified.</text>
  <text class="s" x="320" y="168" text-anchor="middle">Silence means the address is free. A reply means it is taken, and the host must not use it.</text>
  <text class="s" x="320" y="188" text-anchor="middle">This runs for <tspan font-weight="700">every</tspan> address on the interface, including the global one from step 4.</text>
</svg>
<p class="walk-say"><span class="walk-title">Duplicate Address Detection — asking about yourself</span>
Before using any address, the host sends a Neighbour Solicitation <b>for its own address</b>, sourced from the unspecified address <code>::</code>. If anything replies, the address is a duplicate and must not be used — on a router the interface goes into <code>DUPLICATE</code> state and stops working on IPv6.
<br><br>IPv4 has nothing equivalent that is mandatory. Gratuitous ARP is a convention; DAD is part of the protocol, and every IPv6 address you ever see passed it.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The host solicits a router and the router advertises the prefix and its own link local address as the gateway">
  <style>.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv5 .q{stroke:#F2994A;stroke-width:2.5;fill:none}.sv5 .a{stroke:#1f9d6b;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="40" y="70" width="110" height="34" rx="3"/><text class="nt" x="95" y="92" text-anchor="middle">HOST</text>
  <rect class="n" x="490" y="70" width="110" height="34" rx="3"/><text class="nt" x="545" y="92" text-anchor="middle">ROUTER</text>
  <path class="q" d="M 150 78 L 490 78"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 150 78 L 490 78"/></circle>
  <path class="a" d="M 490 98 L 150 98"/>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="1.7s" begin="0.85s" repeatCount="indefinite" path="M 490 98 L 150 98"/></circle>
  <text class="k" x="320" y="54" text-anchor="middle" fill="#B26014">RS — type 133 — to ff02::2, all routers</text>
  <text class="k" x="320" y="128" text-anchor="middle" fill="#0f6b47">RA — type 134 — to ff02::1, all nodes</text>
  <text class="m" x="320" y="150" text-anchor="middle">prefix 2001:db8:acad:1::/64 · A flag set · router fe80::1</text>
  <text class="s" x="320" y="176" text-anchor="middle">Routers also send RAs unsolicited, every 200 s by default — so a host that misses one still learns.</text>
</svg>
<p class="walk-say"><span class="walk-title">Router Solicitation and Advertisement</span>
The host multicasts an <b>RS</b> to all routers and a router answers with an <b>RA</b> carrying the prefix, its length, the flags that say how to use it, and — implicitly — the router's own <b>link-local</b> address as the default gateway.
<br><br>That is the piece with no IPv4 equivalent: the <b>default gateway is learned from the network itself</b>, not from DHCP and not from configuration. It is also why a rogue RA is such an effective attack, and why <code>ipv6 nd raguard</code> exists.</p>
</div>
<div class="walk-panel">
<svg class="sv6" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The host combines the advertised prefix with its own interface identifier to form a global address">
  <style>.sv6 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv6 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv6 .m{font-family:ui-monospace,Menlo,monospace;font-size:12px;fill:#17171A}.sv6 .p{fill:rgba(31,157,107,.14);stroke:#1f9d6b}.sv6 .i{fill:rgba(75,123,236,.14);stroke:#4b7bec}</style>
  <text class="k" x="14" y="30">from the router's RA</text>
  <rect class="p" x="14" y="40" width="250" height="30"/>
  <text class="m" x="26" y="60" fill="#0f6b47">2001:db8:acad:1::/64</text>
  <text class="k" x="330" y="30">the host already had</text>
  <rect class="i" x="330" y="40" width="250" height="30"/>
  <text class="m" x="342" y="60" fill="#2b5ab8">::21a:2bff:fe3c:4d5e</text>
  <text class="m" x="290" y="60">+</text>
  <rect x="14" y="96" width="566" height="32" fill="#fff" stroke="#17171A"/>
  <text class="m" x="26" y="118">2001:db8:acad:1:21a:2bff:fe3c:4d5e/64</text>
  <text class="k" x="14" y="158">No server was involved. Nothing recorded that this address was handed out.</text>
  <text class="s" x="14" y="182">Which is SLAAC's advantage and its problem — there is no lease, no log, and no record for your IPAM.</text>
</svg>
<p class="walk-say"><span class="walk-title">SLAAC — the prefix plus the bit it already had</span>
Stateless Address Autoconfiguration is exactly this addition: the router supplies the top 64 bits, the host supplies the bottom 64. No server holds any state, which is what "stateless" means.
<br><br><b>The flags in the RA decide what else happens.</b> <code>A</code> (autonomous) says "use this prefix for SLAAC". <code>M</code> (managed) says "also get an address from DHCPv6". <code>O</code> (other) says "get DNS and other options from DHCPv6, but configure your own address". Most enterprises run <b>A plus O</b> — self-configured addresses, DHCPv6 for DNS.
<br><br>And because <code>/64</code> is what SLAAC requires, <b>a subnet longer than /64 breaks it silently</b>. That is the rule behind "always use /64", and the exception is point-to-point links, where <code>/127</code> is correct per RFC 6164.</p>
</div>
<div class="walk-panel">
<svg class="sv7" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Neighbour solicitation and advertisement resolve an address to a MAC in place of ARP">
  <style>.sv7 .n{fill:#17171A}.sv7 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}.sv7 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv7 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv7 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv7 .q{stroke:#F2994A;stroke-width:2.5;fill:none}.sv7 .a{stroke:#1f9d6b;stroke-width:2.5;fill:none}</style>
  <rect class="n" x="30" y="70" width="100" height="34" rx="3"/><text class="nt" x="80" y="92" text-anchor="middle">HOST A</text>
  <rect class="n" x="510" y="70" width="100" height="34" rx="3"/><text class="nt" x="560" y="92" text-anchor="middle">HOST B</text>
  <rect class="n" x="280" y="118" width="100" height="30" rx="3" opacity=".3"/><text class="nt" x="330" y="138" text-anchor="middle">HOST C</text>
  <path class="q" d="M 130 78 L 510 78"/>
  <circle r="5" fill="#F2994A"><animateMotion dur="1.7s" repeatCount="indefinite" path="M 130 78 L 510 78"/></circle>
  <path class="a" d="M 510 98 L 130 98"/>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="1.7s" begin="0.85s" repeatCount="indefinite" path="M 510 98 L 130 98"/></circle>
  <text class="k" x="320" y="54" text-anchor="middle" fill="#B26014">NS — type 135 — to ff02::1:ffaa:bb01, not to everyone</text>
  <text class="k" x="320" y="122" text-anchor="middle" fill="#0f6b47">NA — type 136 — &#8220;that is me, here is my MAC&#8221;</text>
  <text class="s" x="330" y="166" text-anchor="middle" opacity=".6">Host C never joined that group, so its NIC filters the frame out. It is not interrupted at all.</text>
  <text class="s" x="320" y="188" text-anchor="middle">IPv4's ARP broadcast would have woken every host on the segment to learn it was not the answer.</text>
</svg>
<p class="walk-say"><span class="walk-title">NS and NA — ARP, but aimed</span>
Resolution works the same way as ARP in principle and better in practice: the request goes to the <b>solicited-node group</b> of the address being sought, so only hosts sharing those low 24 bits are disturbed.
<br><br>The results live in the <b>neighbour cache</b> — <code>show ipv6 neighbors</code>, the direct equivalent of <code>show ip arp</code>. Entries have states (<code>REACH</code>, <code>STALE</code>, <code>DELAY</code>, <code>PROBE</code>) rather than just a timer, and a <code>STALE</code> entry is perfectly normal: it means the neighbour has not been heard from recently, not that anything is wrong.</p>
</div>
</div>
</div>

### The solicitation on the wire

<div class="cap">
<div class="cap-head">Capture · neighbour solicitation <span class="cap-filter">icmpv6.type == 135</span></div>
<div class="cap-tree"><pre>&#9662; Ethernet II
    <span class="f">Destination:</span> <span class="v">IPv6mcast_ff:aa:bb:01 (<mark>33:33:ff:aa:bb:01</mark>)</span>
    <span class="f">Type:</span> <span class="v">IPv6 (0x86dd)</span>
&#9662; Internet Protocol Version 6
    <span class="f">Source:</span> <span class="v">fe80::21a:2bff:fe3c:4d5e</span>       &#8592; a <b>link-local</b> source, as always
    <span class="f">Destination:</span> <span class="v"><mark>ff02::1:ffaa:bb01</mark></span>          &#8592; the solicited-node group
    <span class="f">Next Header:</span> <span class="v">ICMPv6 (58)</span>
    <span class="f">Hop Limit:</span> <span class="v"><mark>255</mark></span>                        &#8592; mandatory — see below
&#9662; Internet Control Message Protocol v6
    <span class="f">Type:</span> <span class="v"><mark>Neighbor Solicitation (135)</mark></span>
    <span class="f">Target Address:</span> <span class="v">2001:db8:acad:1:20c:29ff:feaa:bb01</span>
  &#9662; <span class="f">ICMPv6 Option — Source link-layer address</span>
      <span class="f">Link-layer address:</span> <span class="v">00:1a:2b:3c:4d:5e</span></pre></div>
<div class="cap-hex"><pre>0000  <mark>33 33 ff aa bb 01</mark> 00 1a  2b 3c 4d 5e <mark>86 dd</mark> 60 00   33......+&lt;M^..`.
0010  00 00 00 20 <mark>3a</mark> <mark>ff</mark> fe 80  00 00 00 00 00 00 02 1a   ... :...........
0020  2b ff fe 3c 4d 5e ff 02  00 00 00 00 00 00 00 00   +..&lt;M^..........
0030  00 01 <mark>ff aa bb 01</mark> <mark>87</mark> 00  0c ea 00 00 00 00 20 01   .............. .
0040  0d b8 ac ad 00 01 02 0c  29 ff fe aa bb 01 01 01   ........).......
0050  00 1a 2b 3c 4d 5e                                  ..+&lt;M^</pre></div>
<div class="cap-note"><b>Three highlights tell the story.</b> <code>33 33 ff aa bb 01</code> — the Ethernet destination is <b><code>33:33</code> plus the last 32 bits of the IPv6 multicast address</b>, the IPv6 equivalent of IPv4's <code>01:00:5e</code> mapping and mercifully collision-free by comparison. <code>3a</code> — next header 58, ICMPv6. <code>87</code> — type 135, Neighbour Solicitation.
<br><br>And <code>ff</code> — <b>hop limit 255</b>, which is not decoration. Every NDP message must be sent with a hop limit of 255 and a receiver must <b>discard any that arrives with less</b>. Since every router decrements it, a hop limit of 255 on arrival <em>proves</em> the packet was not routed — it originated on this segment. That single byte is how NDP defends itself against off-link attackers, and it is the same trick VRRP uses.</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="t">ipv6 unicast-routing</span>
!
interface GigabitEthernet0/0
 <span class="t">ipv6 address</span> <span class="opt">2001:db8:acad:1::1/64</span>
 <span class="t">ipv6 address</span> <span class="opt">fe80::1</span> <span class="t">link-local</span>
 <span class="t">ipv6 address</span> <span class="opt">2001:db8:acad:2::/64</span> <span class="t">eui-64</span>
 <span class="t">ipv6 enable</span>
 <span class="t">ipv6 nd prefix</span> <span class="opt">2001:db8:acad:1::/64</span> <span class="t">no-autoconfig</span>
 <span class="t">ipv6 nd ra</span> <span class="opt">suppress</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ipv6 unicast-routing</dt><dd>Global, and <b>off by default</b>. Without it the router has IPv6 addresses and does not route or send Router Advertisements — so hosts get no prefix and no gateway, while every interface looks perfectly configured. This is the first thing to check when SLAAC "is not working".</dd></div>
<div><dt>ipv6 address …/64</dt><dd>A static global address. An interface may hold <b>several</b>, and that is normal — there is no "secondary" keyword because no address is secondary.</dd></div>
<div class="is-key"><dt>ipv6 address fe80::1<br>link-local</dt><dd>Overrides the auto-generated link-local with something you can type. Worth doing on every router interface: the link-local <b>is the next hop your neighbours will see</b>, and <code>fe80::1</code> in a routing table is enormously easier to work with than <code>fe80::21a:2bff:fe3c:4d5e</code>.</dd></div>
<div><dt>eui-64</dt><dd>Supply the /64 prefix and let the router build the interface ID from its MAC. Convenient on routers, deprecated on hosts for the privacy reason above.</dd></div>
<div><dt>ipv6 enable</dt><dd>Turns on IPv6 with <b>only</b> a link-local address and no global one. Exactly what you want on a point-to-point link between routers that carries nothing but a routing protocol — the protocol uses link-local anyway.</dd></div>
<div class="is-key"><dt>ipv6 nd prefix …<br>no-autoconfig</dt><dd>Advertises the prefix but clears the <b>A flag</b>, so hosts learn the route without configuring themselves from it. Combine with <code>ipv6 nd managed-config-flag</code> (the <b>M</b> flag) to push hosts onto DHCPv6 instead, when you need the audit trail SLAAC does not give you.</dd></div>
<div><dt>ipv6 nd ra suppress</dt><dd>Stops RAs on this interface entirely. Correct on a link where no hosts live; <b>catastrophic</b> on a user VLAN, where it silently removes every host's default gateway.</dd></div>
</dl>
</div>

<div class="real">
<b>In the real world</b>
The IPv6 fault that wastes the most time is a <b>rogue Router Advertisement</b>, and it is almost never malicious. A user plugs in a home router the wrong way round, or a laptop with internet connection sharing enabled starts advertising itself as a gateway, and <b>every host on the VLAN that hears it will use it</b> — because RAs are trusted by default and hosts prefer whichever router answers. Traffic for the whole subnet is suddenly black-holed through somebody's desk, and the IPv4 network keeps working perfectly, so nobody connects the two.
<br><br>The fix is one line per access port — <code>ipv6 nd raguard</code>, or an RA guard policy — and it belongs in your access-port template alongside BPDU guard and DHCP snooping. Same class of problem, same class of answer.
</div>

### Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — several addresses per interface, and that is correct</div>
<pre><span class="p">R1#</span> <span class="c">show ipv6 interface brief</span>
GigabitEthernet0/0         [up/up]
    <span class="y">FE80::1</span>                                  <span class="o">&lt;- link-local, always first</span>
    <span class="y">2001:DB8:ACAD:1::1</span>
    <span class="y">2001:DB8:ACAD:2:21A:2BFF:FE3C:4D5E</span>       <span class="o">&lt;- the eui-64 one</span>

<span class="p">R1#</span> <span class="c">show ipv6 interface GigabitEthernet0/0</span>
  IPv6 is enabled, link-local address is FE80::1
  <span class="g">Joined group address(es):</span>
    <span class="g">FF02::1</span>                <span class="o">&lt;- all nodes</span>
    <span class="g">FF02::2</span>                <span class="o">&lt;- all routers (because unicast-routing is on)</span>
    <span class="g">FF02::1:FF00:1</span>         <span class="o">&lt;- solicited-node for ::1</span>
    <span class="g">FF02::1:FF3C:4D5E</span>      <span class="o">&lt;- solicited-node for the eui-64 address</span>
  ND DAD is enabled, number of DAD attempts: 1
  ND advertised reachable time is 0 milliseconds
  <span class="y">ND router advertisements are sent every 200 seconds</span>

<span class="p">R1#</span> <span class="c">show ipv6 neighbors</span>
IPv6 Address                    Age Link-layer Addr <span class="y">State</span> Interface
2001:DB8:ACAD:1::10               0 000c.29aa.bb01  <span class="g">REACH</span> Gi0/0
FE80::20C:29FF:FEAA:BB01          3 000c.29aa.bb01  <span class="y">STALE</span> Gi0/0

<span class="o">! STALE is not a fault. It means "not heard from lately" — the entry is still usable,</span>
<span class="o">! and the first packet sent will move it to DELAY and then PROBE to re-verify.</span>

<span class="p">R1#</span> <span class="c">show ipv6 route</span>
C   2001:DB8:ACAD:1::/64 [0/0]
     via GigabitEthernet0/0, directly connected
L   2001:DB8:ACAD:1::1/128 [0/0]
     via GigabitEthernet0/0, receive
O   2001:DB8:ACAD:9::/64 [110/2]
     via <span class="y">FE80::2</span>, GigabitEthernet0/1        <span class="o">&lt;- next hop is LINK-LOCAL. Normal.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The group list is the most useful output here.</b> An interface's joined groups tell you what it will actually receive: <code>FF02::2</code> only appears when the device is routing, and there is one solicited-node group per unicast address. If a host is not answering solicitations, check whether it joined the group — that is a more precise question than "is IPv6 working".</p>

---

## What goes wrong

**Hosts get no address.** `ipv6 unicast-routing` is off, so no RAs are sent. The interfaces look fine.

**Hosts get an address but no gateway.** `ipv6 nd ra suppress` on a user VLAN, or RA guard blocking the legitimate router.

**SLAAC silently fails on one VLAN.** The prefix is longer than `/64`. SLAAC requires exactly 64 bits of interface ID.

**An interface shows `DUPLICATE`.** DAD found the address in use. Common when the same `fe80::1` is configured on two routers on the same segment.

**Everything reaches the router but nothing goes further.** IPv6 routing is a separate table and a separate protocol configuration. `show ipv6 route` is not `show ip route`.

**A capture shows no `ff:fe` in any host address.** Privacy extensions. Expected on every modern client.

**Traffic is going to the wrong gateway and IPv4 is fine.** A rogue RA. `show ipv6 nd raguard policy` and check your access ports.

---

<div class="lab">
<div class="lab-head">Lab — build an address by hand, then let the network do it for you</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Derive an EUI-64 address and a solicited-node group on paper and then prove both against a live router. Watch a host configure itself with no DHCP server in existence, capture every NDP message involved, and identify which one replaced ARP and which replaced the default-gateway option. Then break SLAAC three ways — no routing, suppressed RAs and a /48 prefix — and produce a rogue RA before blocking it.</div>

**Topology.** R1 with Gi0/0 on a user VLAN, one Linux or Windows host on that VLAN, a switch between them with a SPAN port, and a second host that will play the rogue router.

<p class="lab-step"><span class="n">1</span>Do the arithmetic before the router does</p>

Take R1's Gi0/0 MAC from `show interfaces`. On paper: split it, insert `FFFE`, flip the seventh bit, and write the resulting link-local address. Then work out the solicited-node group for it.

```cisco
R1(config-if)# ipv6 address 2001:db8:acad:1::/64 eui-64
R1# show ipv6 interface Gi0/0
```

<div class="lab-watch"><b>Things to notice</b>
Compare your paper answer to the router's. The bit you most likely got wrong is the flip — a MAC starting <code>00</code> gives an interface ID starting <code>02</code>, which compresses to a leading <code>2</code>. Then check the <b>Joined group address(es)</b> list and find your hand-derived solicited-node group in it.
<br><br>Doing this once by hand is worth more than reading it ten times, because from then on you can look at <code>21a:2bff:fe3c:4d5e</code> and read the MAC straight back out of it.</div>

<p class="lab-step"><span class="n">2</span>Let a host configure itself, and capture everything</p>

Start a capture on the SPAN port filtered on `icmpv6`. Then bring the host's interface up with no DHCP server anywhere on the VLAN.

<div class="lab-watch"><b>Things to notice</b>
In order you should see: a <b>NS from <code>::</code></b> (DAD for the link-local), an <b>RS to ff02::2</b>, an <b>RA from the router's link-local</b>, another <b>NS from <code>::</code></b> (DAD for the new global address), and then ordinary <b>NS/NA</b> pairs as it starts talking.
<br><br>Open the RA and find the <b>prefix, the prefix length, and the A/M/O flags</b>. Then confirm the host's chosen gateway matches the RA's <em>source</em> address — a link-local — and not any global address. Check the hop limit on every one of these: 255, every time.</div>

<p class="lab-step"><span class="n">3</span>Prove NS is not a broadcast</p>

With three hosts on the VLAN, ping one from another and capture on the **third**.

<div class="lab-watch"><b>Things to notice</b>
The third host's NIC does not receive the solicitation at all, because it never joined that solicited-node group. Compare with an IPv4 ARP for the same pair, which it does receive and must process.
<br><br>That is the concrete benefit of solicited-node addressing, and it scales: on a /64 with a thousand hosts, an IPv6 address resolution disturbs roughly one of them.</div>

<p class="lab-step"><span class="n">4</span>Break SLAAC three ways</p>

1. `no ipv6 unicast-routing` globally.
2. Restore it, then `ipv6 nd ra suppress` on Gi0/0.
3. Restore, then change the prefix to a `/48`.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>The host keeps its address</b> — SLAAC addresses have lifetimes and do not vanish instantly. Release and renew, or bounce the interface.</li>
<li><b>The /48 still works</b> — some hosts will accept it. Check whether the address it formed actually has the advertised prefix; most will simply not autoconfigure and you will see the RA arrive with no address resulting.</li>
<li><b>You cannot tell them apart</b> — that is the point. Capture in each case: case 1 and 2 produce <b>no RA at all</b>; case 3 produces an RA that hosts ignore. Same symptom, different packet.</li>
</ul></div>

<p class="lab-step"><span class="n">5</span>Become the rogue router</p>

On the second Linux host, advertise yourself: enable `radvd` with a made-up prefix, or use `rdisc6`/`fake_router6` from the THC-IPv6 suite. **Isolated lab only.**

<div class="lab-watch"><b>Things to notice</b>
The first host picks up your prefix and <b>may prefer your gateway</b> — and its IPv4 connectivity is completely unaffected, so every IPv4 test you run says the network is healthy. Look at the host's routing table and find two default gateways.
<br><br>This is the attack in about thirty seconds with no privileges on the network. Then apply RA guard on the access port:
<br><br><code>ipv6 nd raguard policy HOST-PORT</code> / <code>device-role host</code>, applied to the interface — and repeat. The rogue RA never reaches the VLAN.</div>

<p class="lab-step"><span class="n">6</span>Make the routing table readable</p>

Set `ipv6 address fe80::1 link-local` on R1 and `fe80::2` on R2, then run OSPFv3 between them.

<div class="lab-watch"><b>Things to notice</b>
<code>show ipv6 route</code> now shows next hops of <code>FE80::2</code> instead of a sixteen-character EUI-64 address. That is a small change that pays back every single time anybody reads the table under pressure.
<br><br>Confirm the routing protocol is genuinely using link-local: <code>show ospfv3 neighbor</code> lists link-local addresses, and the interfaces need no global address at all for it to work — try <code>ipv6 enable</code> with no global address on the link between them and watch the adjacency form anyway.</div>

<div class="lab-earned"><b>What you earned</b>
You can derive an EUI-64 interface ID and a solicited-node group by hand and read a MAC back out of an IPv6 address on sight. You have watched a host configure itself, find a gateway and verify uniqueness with four ICMPv6 messages and no server, so "IPv6 does not need DHCP" is something you have observed rather than been told. You know that hop limit 255 on every NDP message is a security mechanism, not a default. And you have run a rogue RA attack and blocked it, which is the IPv6 fault most likely to reach you first and the one that hides behind a perfectly healthy IPv4 network.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>A MAC of <code>00:1a:2b:3c:4d:5e</code> becomes which EUI-64 interface identifier?</p>
<label class="qz-opt"><input type="radio" name="v6q1"><span><code>001a:2bff:fe3c:4d5e</code></span><em class="qz-fb qz-bad">FFFE is inserted correctly, but the seventh bit was not flipped. <code>00</code> must become <code>02</code>.</em></label>
<label class="qz-opt"><input type="radio" name="v6q1"><span><code>021a:2bff:fe3c:4d5e</code></span><em class="qz-fb qz-good">Correct — split, insert FFFE, flip bit 7 so <code>00</code> becomes <code>02</code>. Written in an address it compresses to <code>21a:2bff:fe3c:4d5e</code>.</em></label>
<label class="qz-opt"><input type="radio" name="v6q1"><span><code>001a:2b3c:4d5e:ffff</code></span><em class="qz-fb qz-bad">FFFE goes in the middle, not at the end, and it is FFFE rather than FFFF.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why must every NDP message have a hop limit of 255?</p>
<label class="qz-opt"><input type="radio" name="v6q2"><span>So it can cross up to 255 routers</span><em class="qz-fb qz-bad">NDP must never cross <em>any</em> router — the requirement exists for the opposite reason.</em></label>
<label class="qz-opt"><input type="radio" name="v6q2"><span>So a receiver can prove the packet was not routed — any router would have decremented it</span><em class="qz-fb qz-good">Correct. Arriving at 255 proves it originated on this link, which stops off-link attackers injecting NDP. A receiver discards anything lower.</em></label>
<label class="qz-opt"><input type="radio" name="v6q2"><span>It is an arbitrary value with no meaning</span><em class="qz-fb qz-bad">It is checked and enforced, and it is the same trick VRRP uses.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Hosts on a VLAN get an IPv6 address but no default gateway. Most likely cause?</p>
<label class="qz-opt"><input type="radio" name="v6q3"><span>RAs are not reaching them — suppressed, or blocked by RA guard</span><em class="qz-fb qz-good">Right. The gateway comes from the RA's source address, so no RA means no gateway even if addressing works by other means.</em></label>
<label class="qz-opt"><input type="radio" name="v6q3"><span>The prefix is wrong</span><em class="qz-fb qz-bad">A wrong prefix would break addressing too, and they have addresses.</em></label>
<label class="qz-opt"><input type="radio" name="v6q3"><span>DHCPv6 is not configured</span><em class="qz-fb qz-bad">DHCPv6 does not supply a default gateway at all — that job belongs exclusively to the RA.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Why is a subnet longer than <code>/64</code> a problem on a user VLAN?</p>
<label class="qz-opt"><input type="radio" name="v6q4"><span>SLAAC requires a 64-bit interface identifier, so autoconfiguration silently fails</span><em class="qz-fb qz-good">Correct. Routing works, the RA is sent, and hosts simply do not form an address. The exception is point-to-point links, where /127 is correct per RFC 6164.</em></label>
<label class="qz-opt"><input type="radio" name="v6q4"><span>IPv6 does not support masks longer than /64</span><em class="qz-fb qz-bad">It does — /127 and /128 are both routine.</em></label>
<label class="qz-opt"><input type="radio" name="v6q4"><span>The router will reject the configuration</span><em class="qz-fb qz-bad">It is accepted without complaint, which is what makes the failure quiet.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>A routing table shows next hops like <code>FE80::2</code>. Is that correct?</p>
<label class="qz-opt"><input type="radio" name="v6q5"><span>Yes — link-local is the normal next hop for IPv6 routing protocols</span><em class="qz-fb qz-good">Correct, and it is why IPv6 route output always names an interface too: a link-local address is only meaningful on one link.</em></label>
<label class="qz-opt"><input type="radio" name="v6q5"><span>No — next hops must be global addresses</span><em class="qz-fb qz-bad">Global next hops are the exception. OSPFv3, EIGRPv6 and NDP all use link-local.</em></label>
<label class="qz-opt"><input type="radio" name="v6q5"><span>Only if the interfaces have no global address</span><em class="qz-fb qz-bad">It happens regardless of whether global addresses are configured.</em></label>
</div>

---

## References

- **RFC 4291** — IP Version 6 Addressing Architecture. The ranges, the types and modified EUI-64.
- **RFC 4861** — Neighbor Discovery for IPv6. RS, RA, NS, NA and the hop-limit-255 rule.
- **RFC 4862** — IPv6 Stateless Address Autoconfiguration (SLAAC) and Duplicate Address Detection.
- **RFC 4193** — Unique Local IPv6 Unicast Addresses.
- **RFC 6164** — Using 127-Bit IPv6 Prefixes on Inter-Router Links.
- **RFC 8981** — Temporary Address Extensions for SLAAC, the privacy addresses modern hosts use instead of EUI-64.
- Cisco — [IPv6 Addressing and Basic Connectivity Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipv6_basic/configuration/xe-17/ip6b-xe-17-book.html)

---

*Related: [How a router chooses](/blog/how-a-router-chooses-routing-table-longest-match-and-ad) · [OSPF: areas, LSAs and adjacency](/blog/ospf-explained-areas-lsas-and-adjacency).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
