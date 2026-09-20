---
title: "Policy-Based Routing: Overriding the Routing Table Without Changing It"
excerpt: "A router forwards on destination and nothing else. PBR is the escape hatch — match on source, protocol, port or packet size, and send those packets somewhere the routing table never would. The mechanism is simple; the traps are not. A deny clause does not drop anything, the router's own packets are exempt unless you say otherwise, and a next hop that goes away will black-hole everything you matched unless you told it to check."
date: "2026-09-22"
tags: ["PBR", "Policy-Based Routing", "Route-map", "Routing", "IP SLA", "ENARSI", "ENCOR", "CCNP"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 1.6 *Configure and verify policy-based routing*. ENCOR 350-401 — 3.2 *Describe policy-based routing*. It sits directly on top of 1.2 *route maps*, so if route-map syntax is shaky, this is where it bites.

## Cheat sheet

| | |
|---|---|
| **Applied** | On **ingress**, with `ip policy route-map NAME` on the interface |
| **When** | **Before** the routing table is consulted. PBR pre-empts routing; it does not modify it |
| **Match on** | ACL (source, destination, protocol, ports) · `match length` (packet size) |
| **`set ip next-hop`** | **Policy first.** Use this next hop; fall back to the routing table only if it is unreachable |
| **`set ip default next-hop`** | **Routing table first.** Only policy-route if there is no route to the destination |
| **`set interface`** | Send out this interface. Fragile — no ARP resolution on multi-access links |
| **Deny clause** | **Not dropped.** The packet is forwarded by the normal routing table |
| **No match at all** | Same thing — implicit deny, normal routing |
| **Router's own packets** | **Not policy routed** unless you add `ip local policy route-map` |
| **To actually drop** | `set interface Null0` |
| **Verify** | `show route-map` · `show ip policy` · `debug ip policy` |

**The sentence that prevents most mistakes.** A route-map used for PBR is **not an access list**. `deny` means *"this packet is exempt from the policy"*, not *"this packet is blocked"* — and the implicit deny at the end means everything you did not match is routed completely normally.

---

## What problem it actually solves

A router's forwarding decision uses exactly one field: the **destination address**. Longest prefix match, then administrative distance, then metric — and none of those look at who sent the packet or what it contains.

That is almost always what you want, and occasionally it is useless:

- Two internet links, and you want the guest VLAN on the cheap one and the finance VLAN on the good one. Same destination — the whole internet — different sources.
- A backup job that should take the slow secondary circuit so it does not compete with production traffic.
- Traffic to a partner that must leave via a specific firewall for inspection, while everything else routes normally.
- A lab segment that must be forced through a transparent proxy.

In every case the destination is identical and the decision is not about the destination at all.

<figure class="fig">
<svg viewBox="0 0 640 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Normal routing sends both subnets out the same link because the destination is the same, while policy-based routing splits them by source">
  <style>
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .hdr{font-family:ui-sans-serif,system-ui;font-size:10.5px;font-weight:700;letter-spacing:.06em}
    .l{stroke:#8A8A93;stroke-width:1.5}
  </style>
  <text class="hdr" x="14" y="16" fill="#D3002D">ROUTING ALONE — ONE ANSWER FOR BOTH</text>
  <rect class="n" x="14" y="44" width="86" height="26" rx="3"/><text class="nt" x="57" y="62" text-anchor="middle">GUEST</text>
  <rect class="n" x="14" y="82" width="86" height="26" rx="3"/><text class="nt" x="57" y="100" text-anchor="middle">FINANCE</text>
  <rect class="n" x="150" y="62" width="56" height="30" rx="3"/><text class="nt" x="178" y="82" text-anchor="middle">R1</text>
  <line class="l" x1="100" y1="57" x2="150" y2="72"/>
  <line class="l" x1="100" y1="95" x2="150" y2="82"/>
  <line class="l" x1="206" y1="77" x2="264" y2="60" stroke="#D3002D" stroke-width="3"/>
  <line class="l" x1="206" y1="82" x2="264" y2="104" stroke-dasharray="4 4"/>
  <rect class="n" x="264" y="44" width="56" height="26" rx="3"/><text class="nt" x="292" y="62" text-anchor="middle">ISP-A</text>
  <rect class="n" x="264" y="92" width="56" height="26" rx="3" opacity=".4"/><text class="nt" x="292" y="110" text-anchor="middle">ISP-B</text>
  <circle r="4" fill="#D3002D"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 206 77 L 264 60"/></circle>
  <text class="s" x="180" y="136" text-anchor="middle" fill="#D3002D">both take ISP-A — the destination is the same</text>
  <text class="s" x="180" y="152" text-anchor="middle">ISP-B sits idle unless ISP-A fails</text>
  <line x1="352" y1="10" x2="352" y2="166" stroke="#ECECEF"/>
  <text class="hdr" x="386" y="16" fill="#0f6b47">WITH PBR — DECIDED BY SOURCE</text>
  <rect class="n" x="386" y="44" width="86" height="26" rx="3"/><text class="nt" x="429" y="62" text-anchor="middle">GUEST</text>
  <rect class="n" x="386" y="82" width="86" height="26" rx="3"/><text class="nt" x="429" y="100" text-anchor="middle">FINANCE</text>
  <rect class="n" x="498" y="62" width="56" height="30" rx="3" fill="#D3002D"/><text class="nt" x="526" y="82" text-anchor="middle">R1</text>
  <line class="l" x1="472" y1="57" x2="498" y2="72"/>
  <line class="l" x1="472" y1="95" x2="498" y2="82"/>
  <line x1="554" y1="72" x2="586" y2="104" stroke="#4b7bec" stroke-width="3"/>
  <line x1="554" y1="80" x2="586" y2="60" stroke="#1f9d6b" stroke-width="3"/>
  <rect class="n" x="570" y="44" width="56" height="26" rx="3"/><text class="nt" x="598" y="62" text-anchor="middle">ISP-A</text>
  <rect class="n" x="570" y="92" width="56" height="26" rx="3"/><text class="nt" x="598" y="110" text-anchor="middle">ISP-B</text>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 554 72 L 586 104"/></circle>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.6s" repeatCount="indefinite" path="M 554 80 L 586 60"/></circle>
  <text class="s" x="500" y="136" text-anchor="middle" fill="#0f6b47">guest → ISP-B, finance → ISP-A</text>
  <text class="s" x="500" y="152" text-anchor="middle">both links carry traffic, by policy</text>
  <rect x="14" y="182" width="612" height="56" fill="#F1EEE9" stroke="#D9D9DE"/>
  <text class="k" x="26" y="202" fill="#17171A">And the routing table on R1 is identical in both pictures.</text>
  <text class="s" x="26" y="220">PBR does not add a route, change a metric or install anything. <tspan font-weight="700">It intercepts the packet before the lookup happens.</tspan></text>
  <text class="s" x="26" y="234">Which is exactly why <tspan font-family="ui-monospace,Menlo,monospace">show ip route</tspan> will never explain the behaviour you are seeing.</text>
</svg>
<figcaption><b>Figure 1.</b> The single most useful thing to hold onto: PBR is invisible to every routing command. If a packet is going somewhere the routing table does not explain, check for a policy before you check anything else.</figcaption>
</figure>

---

## What happens to a packet, exactly

<div class="walk">
<div class="walk-head">One packet arriving on an interface with a policy <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="pbrw" id="pb1" checked><label for="pb1"><span class="step-n">1</span>Ingress</label>
  <input type="radio" name="pbrw" id="pb2"><label for="pb2"><span class="step-n">2</span>Match</label>
  <input type="radio" name="pbrw" id="pb3"><label for="pb3"><span class="step-n">3</span>No match</label>
  <input type="radio" name="pbrw" id="pb4"><label for="pb4"><span class="step-n">4</span>Deny</label>
  <input type="radio" name="pbrw" id="pb5"><label for="pb5"><span class="step-n">5</span>Next hop gone</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A packet arriving on an interface with a policy is checked against the route map before the routing table">
  <style>.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.bx{fill:#F1EEE9;stroke:#B5B5BC}.hot{fill:rgba(211,0,45,.14);stroke:#D3002D}</style>
  <defs><marker id="pm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <rect class="bx" x="20" y="60" width="96" height="32" rx="3"/><text class="m" x="68" y="80" text-anchor="middle">packet in</text>
  <line x1="120" y1="76" x2="146" y2="76" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#pm)"/>
  <rect class="hot" x="150" y="60" width="150" height="32" rx="3"/><text class="m" x="225" y="80" text-anchor="middle" fill="#B80027">PBR route-map</text>
  <line x1="304" y1="76" x2="330" y2="76" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#pm)"/>
  <rect class="bx" x="334" y="60" width="140" height="32" rx="3"/><text class="m" x="404" y="80" text-anchor="middle">routing table</text>
  <line x1="478" y1="76" x2="504" y2="76" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#pm)"/>
  <rect class="bx" x="508" y="60" width="110" height="32" rx="3"/><text class="m" x="563" y="80" text-anchor="middle">forward</text>
  <circle r="5" fill="#D3002D"><animateMotion dur="2s" repeatCount="indefinite" path="M 20 76 L 150 76"/></circle>
  <text class="k" x="225" y="40" text-anchor="middle" fill="#B80027">the policy is consulted FIRST</text>
  <text class="s" x="320" y="132" text-anchor="middle">Applied with <tspan font-family="ui-monospace,Menlo,monospace">ip policy route-map NAME</tspan> on the <tspan font-weight="700">ingress</tspan> interface —</text>
  <text class="s" x="320" y="150" text-anchor="middle">the one the packet arrives on, not the one it leaves by. That catches people constantly.</text>
  <text class="s" x="320" y="174" text-anchor="middle">Nothing below has happened yet. The routing table has not been touched.</text>
</svg>
<p class="walk-say"><span class="walk-title">Ingress, and only ingress</span>
PBR is configured on the interface the packet <b>arrives on</b>. If you want to influence traffic from the guest VLAN, the policy goes on the guest VLAN's SVI — not on the WAN interface it will eventually leave by.
<br><br>This is the first thing to check when a policy "is not working": <code>show ip policy</code> lists which interfaces have one, and half the time it is on the wrong side.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A packet matching a permit clause is sent to the policy next hop and the routing table is bypassed">
  <style>.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.bx{fill:#F1EEE9;stroke:#B5B5BC}.hot{fill:rgba(31,157,107,.16);stroke:#1f9d6b}.dim{opacity:.35}</style>
  <defs><marker id="pm2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#1f9d6b"/></marker></defs>
  <rect class="bx" x="20" y="60" width="96" height="32" rx="3"/><text class="m" x="68" y="80" text-anchor="middle">10.1.9.50</text>
  <rect class="hot" x="150" y="60" width="150" height="32" rx="3"/><text class="m" x="225" y="80" text-anchor="middle" fill="#0f6b47">permit · match</text>
  <rect class="bx dim" x="334" y="60" width="140" height="32" rx="3"/><text class="m dim" x="404" y="80" text-anchor="middle">routing table</text>
  <rect class="bx" x="508" y="60" width="110" height="32" rx="3"/><text class="m" x="563" y="80" text-anchor="middle">ISP-B</text>
  <path d="M 300 70 C 380 34 440 34 512 62" stroke="#1f9d6b" stroke-width="2.5" fill="none" marker-end="url(#pm2)"/>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 20 76 L 150 76 L 300 70 C 380 34 440 34 512 62"/></circle>
  <text class="k" x="404" y="26" text-anchor="middle" fill="#0f6b47">set ip next-hop 203.0.113.9 — the lookup is skipped</text>
  <text class="s" x="404" y="110" text-anchor="middle" class="dim">never consulted for this packet</text>
  <text class="s" x="320" y="150" text-anchor="middle">The routing table may well have a perfectly good route to this destination. It is not used.</text>
  <text class="s" x="320" y="172" text-anchor="middle"><tspan font-weight="700">set ip next-hop</tspan> means &#8220;policy first&#8221; — the table is only a fallback, and only if the next hop is unreachable.</text>
</svg>
<p class="walk-say"><span class="walk-title">A match bypasses the lookup entirely</span>
The packet is sent to the next hop the policy names, and the routing table is not consulted at all. This is the behaviour people want and also the one that surprises them — a destination with a perfectly good route in the table can be sent somewhere else entirely, and nothing in <code>show ip route</code> hints at it.
<br><br><b>The counters are the proof.</b> <code>show route-map</code> shows a <code>Policy routing matches</code> count that increments per packet. If it is not moving, the packet is not matching, whatever the ACL looks like.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A packet that matches nothing falls through to the routing table and is forwarded normally">
  <style>.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.bx{fill:#F1EEE9;stroke:#B5B5BC}.hot{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <defs><marker id="pm3" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <rect class="bx" x="20" y="60" width="96" height="32" rx="3"/><text class="m" x="68" y="80" text-anchor="middle">10.1.5.20</text>
  <line x1="120" y1="76" x2="146" y2="76" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#pm3)"/>
  <rect class="hot" x="150" y="60" width="150" height="32" rx="3"/><text class="m" x="225" y="80" text-anchor="middle">no clause matches</text>
  <line x1="304" y1="76" x2="330" y2="76" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#pm3)"/>
  <rect class="bx" x="334" y="60" width="140" height="32" rx="3" fill="rgba(31,157,107,.16)" stroke="#1f9d6b"/><text class="m" x="404" y="80" text-anchor="middle" fill="#0f6b47">routing table</text>
  <line x1="478" y1="76" x2="504" y2="76" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#pm3)"/>
  <rect class="bx" x="508" y="60" width="110" height="32" rx="3"/><text class="m" x="563" y="80" text-anchor="middle">ISP-A</text>
  <circle r="5" fill="#8A8A93"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 20 76 L 508 76"/></circle>
  <text class="k" x="320" y="134" text-anchor="middle" fill="#0f6b47">The implicit deny at the end of a PBR route-map means &#8220;route this normally&#8221;.</text>
  <text class="s" x="320" y="158" text-anchor="middle">It does <tspan font-weight="700">not</tspan> mean drop. A route-map is not an access list, however much the syntax looks like one.</text>
  <text class="s" x="320" y="180" text-anchor="middle">Everything you did not deliberately match carries on exactly as if PBR were not configured.</text>
</svg>
<p class="walk-say"><span class="walk-title">No match means normal routing</span>
This is the behaviour that makes PBR safe to deploy. A policy that matches only the guest VLAN leaves every other packet on the interface completely untouched — they fall through to the routing table and are forwarded as usual.
<br><br>It is also why a typo in your ACL produces <b>no visible error</b>. The traffic keeps working; it simply takes the normal path, and you conclude that PBR "is not doing anything" when in fact it is doing exactly what it was told.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 205" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A packet matching a deny clause is exempted from the policy and routed normally rather than dropped">
  <style>.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.bx{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <defs><marker id="pm4" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8A8A93"/></marker></defs>
  <rect class="bx" x="20" y="60" width="96" height="32" rx="3"/><text class="m" x="68" y="80" text-anchor="middle">packet in</text>
  <line x1="120" y1="76" x2="146" y2="76" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#pm4)"/>
  <rect x="150" y="60" width="150" height="32" rx="3" fill="#FFF1F3" stroke="#D3002D"/><text class="m" x="225" y="80" text-anchor="middle" fill="#B80027">deny 10 · match</text>
  <line x1="304" y1="76" x2="330" y2="76" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#pm4)"/>
  <rect class="bx" x="334" y="60" width="140" height="32" rx="3" fill="rgba(31,157,107,.16)" stroke="#1f9d6b"/><text class="m" x="404" y="80" text-anchor="middle" fill="#0f6b47">routing table</text>
  <line x1="478" y1="76" x2="504" y2="76" stroke="#8A8A93" stroke-width="1.5" marker-end="url(#pm4)"/>
  <rect class="bx" x="508" y="60" width="110" height="32" rx="3"/><text class="m" x="563" y="80" text-anchor="middle">forwarded</text>
  <circle r="5" fill="#1f9d6b"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 20 76 L 508 76"/></circle>
  <rect x="14" y="120" width="612" height="72" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="142" fill="#B80027">deny in a PBR route-map = &#8220;exempt this traffic from the policy&#8221;</text>
  <text class="s" x="26" y="162">It stops PBR processing and hands the packet to normal routing. It never drops anything.</text>
  <text class="s" x="26" y="182">To genuinely discard traffic you need an explicit <tspan font-family="ui-monospace,Menlo,monospace" font-weight="700">set interface Null0</tspan> in a <tspan font-family="ui-monospace,Menlo,monospace" font-weight="700">permit</tspan> clause.</text>
</svg>
<p class="walk-say"><span class="walk-title">Deny is an exemption, not a block</span>
This is the single most misread thing in the topic, and it is misread because the syntax is identical to an ACL. In a PBR route-map, a <code>deny</code> clause that matches means "<b>do not apply the policy to this packet</b>" — PBR stops, and the routing table takes over.
<br><br>Used deliberately it is excellent: a <code>deny</code> clause first, matching the traffic that must always route normally (management, monitoring, the address of the next hop itself), then a <code>permit</code> clause catching everything else. Used accidentally — by someone expecting ACL semantics — it silently does the opposite of what they intended.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="If the policy next hop becomes unreachable the matched traffic is black-holed unless availability verification is configured">
  <style>.m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.bx{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <rect class="bx" x="20" y="56" width="96" height="32" rx="3"/><text class="m" x="68" y="76" text-anchor="middle">10.1.9.50</text>
  <rect x="150" y="56" width="150" height="32" rx="3" fill="rgba(31,157,107,.16)" stroke="#1f9d6b"/><text class="m" x="225" y="76" text-anchor="middle" fill="#0f6b47">permit · match</text>
  <rect x="380" y="56" width="120" height="32" rx="3" fill="#FFF1F3" stroke="#D3002D"/><text class="m" x="440" y="76" text-anchor="middle" fill="#B80027">ISP-B down</text>
  <line x1="120" y1="72" x2="146" y2="72" stroke="#8A8A93" stroke-width="1.5"/>
  <line x1="304" y1="72" x2="376" y2="72" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="420" y1="62" x2="460" y2="82" stroke="#D3002D" stroke-width="2.5"/>
  <line x1="460" y1="62" x2="420" y2="82" stroke="#D3002D" stroke-width="2.5"/>
  <circle r="5" fill="#D3002D" class="breathe"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 20 72 L 376 72"/></circle>
  <text class="k" x="320" y="120" text-anchor="middle" fill="#B80027">The matched traffic is black-holed. Everything else keeps working perfectly.</text>
  <text class="s" x="320" y="142" text-anchor="middle">PBR does not care that the next hop is dead — with <tspan font-family="ui-monospace,Menlo,monospace">set ip next-hop</tspan> it only falls back</text>
  <text class="s" x="320" y="158" text-anchor="middle">when the next hop is <tspan font-weight="700">not in the routing table at all</tspan>, which a connected interface still is.</text>
  <rect x="14" y="174" width="612" height="30" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="m" x="26" y="194" fill="#0f6b47">set ip next-hop verify-availability 203.0.113.9 10 track 1</text>
</svg>
<p class="walk-say"><span class="walk-title">The failure that makes PBR dangerous</span>
If ISP-B's router dies but the link stays up, the next hop remains in the routing table as a connected subnet — so PBR keeps sending matched traffic to a device that is not answering. <b>Only the traffic you matched breaks.</b> Everyone else is fine, monitoring is green, and one VLAN is offline.
<br><br>The fix is <code>verify-availability</code> with a <b>tracked object</b> driven by an IP SLA probe. Without it, a PBR policy is a static route with no supervision — and static routes with no supervision are how blackholes happen.</p>
</div>
</div>
</div>

---

## The `set` clauses, and the one distinction that matters

<div class="cmd">
<div class="cmd-line">route-map GUEST-OUT-ISPB permit 10
 <span class="t">match ip address</span> <span class="opt">GUEST-TRAFFIC</span>
 <span class="t">set ip next-hop</span> <span class="opt">203.0.113.9</span>
!
interface Vlan90
 <span class="t">ip policy route-map</span> <span class="opt">GUEST-OUT-ISPB</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>set ip next-hop</dt><dd><b>Policy first, routing table as fallback.</b> The router checks that the next hop is reachable; if it is, the packet goes there and the routing table is never consulted. If the next hop is <em>not in the routing table at all</em>, normal routing takes over. Note the narrowness of that fallback — a next hop on a connected subnet is always "reachable" even when the device is switched off.</dd></div>
<div class="is-key"><dt>set ip default next-hop</dt><dd><b>Routing table first, policy as fallback.</b> The exact opposite. If a route to the destination exists, the packet is routed normally and the policy is ignored; the policy only applies when there is <em>no</em> route. Use this for "send anything I do not have a route for out of the backup link", not for steering traffic — for steering it will do nothing at all, because you almost certainly do have a default route.</dd></div>
<div><dt>set interface</dt><dd>Send the packet out of a named interface. Fine on a <b>point-to-point</b> link where there is only one possible neighbour. On a multi-access interface the router has no next hop to ARP for and the behaviour is unreliable. Prefer <code>set ip next-hop</code> everywhere you can.</dd></div>
<div><dt>set interface Null0</dt><dd>The only way PBR actually <b>drops</b> a packet, and it must be in a <code>permit</code> clause. If you came here looking for how to block traffic with a route-map, this is it — and an ACL is usually the better tool.</dd></div>
<div><dt>set ip precedence /<br>set ip dscp</dt><dd>PBR can mark as well as steer. Useful at an edge where you want to classify on something the QoS policy downstream can then act on.</dd></div>
<div class="is-key"><dt>ip policy route-map<br><span class="opt">(on the interface)</span></dt><dd>Applied to the <b>ingress</b> interface — the one traffic arrives on. Applying it to the egress interface is the commonest reason a correct policy appears to do nothing. Confirm with <code>show ip policy</code>, which lists every interface that has one.</dd></div>
</dl>
</div>

<div class="warn">
<b>The router's own packets are exempt</b>
Traffic <em>generated by</em> the router — your pings from the CLI, NTP, syslog, SNMP traps, routing protocol packets — is <b>not policy routed</b>. This catches people twice. First while testing: you ping from the router, the traffic takes the normal path, and you conclude the policy is broken when it has simply never been offered that packet. Test from a host on the matched subnet instead. Second in production: if you actually need the router's own traffic policy-routed, that needs <code>ip local policy route-map NAME</code> as a global command — and it is worth thinking hard before you do, because it affects routing protocol packets too.
</div>

---

## Making it survive a failure

<div class="cmd">
<div class="cmd-line"><span class="t">ip sla</span> <span class="opt">1</span>
 <span class="t">icmp-echo</span> <span class="opt">203.0.113.9</span> <span class="t">source-interface</span> <span class="opt">GigabitEthernet0/1</span>
 <span class="t">frequency</span> <span class="opt">5</span>
<span class="t">ip sla schedule</span> <span class="opt">1</span> <span class="t">life forever start-time now</span>
!
<span class="t">track</span> <span class="opt">1</span> <span class="t">ip sla</span> <span class="opt">1</span> <span class="t">reachability</span>
!
route-map GUEST-OUT-ISPB permit 10
 match ip address GUEST-TRAFFIC
 <span class="t">set ip next-hop verify-availability</span> <span class="opt">203.0.113.9 10 track 1</span>
 <span class="t">set ip next-hop verify-availability</span> <span class="opt">198.51.100.1 20 track 2</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ip sla 1 icmp-echo</dt><dd>A probe that pings the next hop every 5 seconds. <b>Probe something meaningful</b> — pinging the directly-connected interface only proves the link is up, which you already knew. Probe an address beyond it, or one the ISP guarantees, so the probe fails when the <em>path</em> fails rather than only when the cable does.</dd></div>
<div><dt>source-interface</dt><dd>Pin it, or the probe may leave by a different path than the traffic it is supposed to represent — and then it will happily report success while the path you care about is broken.</dd></div>
<div class="is-key"><dt>track 1 ip sla 1<br>reachability</dt><dd>Turns the probe result into a boolean that other features can read. <code>reachability</code> is up or down; <code>state</code> also exposes the SLA's own return code. This object is the join between "something is measuring" and "something is deciding".</dd></div>
<div class="is-key"><dt>verify-availability<br>&lt;next-hop&gt; &lt;seq&gt; track</dt><dd>PBR uses this next hop <b>only while the tracked object is up</b>. The sequence number orders multiple next hops — 10 is tried first, then 20. If every tracked next hop is down, <b>the policy is skipped entirely</b> and the packet falls through to normal routing, which is exactly the behaviour you want.</dd></div>
<div><dt><span class="opt">(without it)</span></dt><dd>A plain <code>set ip next-hop</code> is an unsupervised static route for the traffic you matched. It will keep pointing at a dead device for as long as the subnet is connected. Every PBR policy in production should have tracking; the ones that do not are waiting.</dd></div>
</dl>
</div>

---

## Verifying it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — three commands, in this order</div>
<pre><span class="p">R1#</span> <span class="c">show ip policy</span>
Interface      Route map
<span class="y">Vlan90         GUEST-OUT-ISPB</span>
<span class="o">! Is the policy on the interface you think it is — the INGRESS one?</span>
<span class="o">! An empty list here explains most "PBR is not working" tickets.</span>

<span class="p">R1#</span> <span class="c">show route-map GUEST-OUT-ISPB</span>
route-map GUEST-OUT-ISPB, permit, sequence 10
  Match clauses:
    ip address (access-lists): GUEST-TRAFFIC
  Set clauses:
    ip next-hop verify-availability 203.0.113.9 10 track 1  [<span class="g">up</span>]
  <span class="g">Policy routing matches: 84122 packets, 61283991 bytes</span>
<span class="o">! THE counter. If it is not incrementing, the packet is not matching —</span>
<span class="o">! and no amount of staring at the ACL will tell you why. Ping from a real host.</span>

<span class="p">R1#</span> <span class="c">debug ip policy</span>
IP: s=10.1.90.50 (Vlan90), d=8.8.8.8, len 84, <span class="g">policy match</span>
IP: route map GUEST-OUT-ISPB, item 10, permit
IP: s=10.1.90.50 (Vlan90), d=8.8.8.8 (GigabitEthernet0/2), len 84, <span class="g">policy routed</span>
IP: Vlan90 to GigabitEthernet0/2 <span class="y">203.0.113.9</span>

IP: s=10.1.5.20 (Vlan90), d=8.8.8.8, len 84, <span class="r">policy rejected -- normal forwarding</span>
<span class="o">! "policy rejected -- normal forwarding" is NOT an error. It is a packet that</span>
<span class="o">! did not match, being routed normally, exactly as designed.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b><code>debug ip policy</code> is safe on a lab router and dangerous on a busy one</b> — it logs per packet. Filter it with an ACL first (<code>debug ip policy 101</code>) or you will overwhelm the console of the router you are trying to fix. The phrase to look for is <code>policy routed</code>; anything else means the packet went the normal way.</p>

<div class="real">
<b>In the real world</b>
The classic PBR outage is not the policy failing — it is the policy <b>working</b> on traffic nobody intended. Somebody matches "the guest subnet" with an ACL that also catches the management VLAN, and now SSH to the switches goes out of the guest ISP, where the return path does not exist. The session you are typing in dies mid-change.
<br><br>Two habits prevent it. Put an explicit <code>deny</code> clause <b>first</b>, matching management and monitoring traffic, so it can never be policy routed whatever the later clauses say. And apply PBR with a reload timer set — <code>reload in 10</code> before the change, <code>reload cancel</code> after you have confirmed you still have access.
</div>

---

## What goes wrong

**Nothing is policy routed.** The policy is on the egress interface instead of the ingress one. `show ip policy`.

**The counter in `show route-map` stays at zero.** The ACL is not matching. Check it with a real host, not a ping from the router — router-generated traffic is exempt.

**Everything still works, and takes the normal path.** That is what a non-matching policy looks like. There is no error state for "PBR did nothing".

**`set ip default next-hop` appears to do nothing.** It only applies when there is no route to the destination — and you almost certainly have a default route, so there always is one. Use `set ip next-hop`.

**Matched traffic black-holes when a circuit fails.** No `verify-availability`. PBR happily forwards to a dead next hop for as long as its subnet is connected.

**Return traffic does not come back.** PBR is one-directional. You have steered outbound traffic down a path whose return route does not exist, or which is dropped by an anti-spoofing check on the far side. Asymmetric routing that PBR created is still asymmetric routing.

**A deny clause did not block anything.** It was never going to. `deny` exempts traffic from the policy; `set interface Null0` in a `permit` clause is the only way PBR drops.

---

<div class="lab">
<div class="lab-head">Lab — steer by source, then make it fail safely</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Split two source subnets across two exits with the routing table untouched, and prove it with a traceroute from each; demonstrate that <code>deny</code> exempts rather than blocks, and that the router's own packets are not policy routed; show why <code>set ip default next-hop</code> is almost never the command you want; and then kill the policy next hop and watch matched traffic black-hole — before fixing it with IP SLA and a tracked object.</div>

**Topology.** R1 with two upstreams — ISP-A (`203.0.113.1`) and ISP-B (`203.0.113.9`) — a default route pointing at ISP-A only, and two inside VLANs: `10.1.90.0/24` (guest) and `10.1.5.0/24` (corporate), each with a host.

<p class="lab-step"><span class="n">1</span>Establish that routing alone cannot do this</p>

```cisco
R1# show ip route 0.0.0.0
```

From both hosts, `traceroute 8.8.8.8`.

<div class="lab-watch"><b>Things to notice</b>
Both take ISP-A, because the destination is identical and the destination is the only thing the routing table looks at. There is no route you could add that would separate them — this is not a limitation of your configuration, it is what destination-based forwarding <em>means</em>. Write down both traceroutes; they are your control.</div>

<p class="lab-step"><span class="n">2</span>Steer the guest VLAN only</p>

```cisco
ip access-list extended GUEST-TRAFFIC
 permit ip 10.1.90.0 0.0.0.255 any
!
route-map GUEST-OUT-ISPB permit 10
 match ip address GUEST-TRAFFIC
 set ip next-hop 203.0.113.9
!
interface Vlan90
 ip policy route-map GUEST-OUT-ISPB
```

Traceroute from both hosts again, then:

```cisco
R1# show ip route 0.0.0.0
R1# show route-map GUEST-OUT-ISPB
```

<div class="lab-watch"><b>Things to notice</b>
The guest host now exits via ISP-B and the corporate host still uses ISP-A — and <b>the routing table is byte-for-byte identical to step 1</b>. Confirm that. This is the thing to internalise: no routing command on this router will ever explain the guest host's path.
<br><br>Watch the <code>Policy routing matches</code> counter climb as you run the traceroute. That counter is the only positive evidence PBR gives you.</div>

<p class="lab-step"><span class="n">3</span>Prove the router is exempt</p>

From R1's own CLI: `traceroute 8.8.8.8 source Vlan90`.

<div class="lab-watch"><b>Things to notice</b>
It takes <b>ISP-A</b> — the normal path — even though the source address matches your ACL perfectly. Router-generated traffic is not policy routed. Anyone who tests PBR this way concludes it is broken.
<br><br>Now add <code>ip local policy route-map GUEST-OUT-ISPB</code> globally and repeat. It takes ISP-B. Then remove it again and think about what you just enabled: that command applies to <em>every</em> packet the router originates, routing protocol hellos included.</div>

<p class="lab-step"><span class="n">4</span>Show that deny does not block</p>

Add a first clause that matches the guest host explicitly:

```cisco
route-map GUEST-OUT-ISPB deny 5
 match ip address host 10.1.90.50
```

<div class="lab-watch"><b>Things to notice</b>
The guest host's traffic is <b>not dropped</b>. It goes back to ISP-A — the normal path — because <code>deny</code> means "exempt from the policy", not "discard". Every other guest host still goes via ISP-B.
<br><br>That is the correct way to carve an exception out of a policy, and the incorrect mental model people bring from ACLs. To actually drop it you would need <code>permit</code> with <code>set interface Null0</code> — try that too, and note that the host now gets no reply at all rather than a different path.</div>

<p class="lab-step"><span class="n">5</span>Demonstrate that default next-hop is a different command</p>

Replace `set ip next-hop 203.0.113.9` with `set ip default next-hop 203.0.113.9`.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Nothing changes and guest traffic goes back to ISP-A</b> — that is the expected result, and the point of the step. You have a default route, so a route to the destination exists, so the policy is skipped.</li>
<li><b>It still policy routes</b> — check you actually removed the plain <code>set ip next-hop</code>; both can coexist and the plain one wins.</li>
<li><b>You want to see it work</b> — remove the default route entirely. Now there is no route to 8.8.8.8, and the policy applies. That is the only situation this command is for.</li>
</ul>
Put the default route and the plain <code>set ip next-hop</code> back before continuing.</div>

<p class="lab-step"><span class="n">6</span>Black-hole the guest VLAN</p>

With guest traffic flowing via ISP-B, shut down ISP-B's router — or on a simulator, shut the far end's interface while leaving R1's link up.

<div class="lab-watch"><b>Things to notice</b>
Guest traffic stops completely. Corporate traffic is unaffected. R1's interface is still up, the connected subnet is still in the routing table, so PBR keeps forwarding to a next hop that is not answering — and its fallback never triggers, because the fallback only fires when the next hop is <b>absent from the routing table</b>, not when it is unreachable.
<br><br>Check every monitoring signal you have: the interface is up, no errors, CPU normal, the routing table unchanged. <b>One VLAN is offline and nothing on the router says so.</b> This is the failure mode that makes unsupervised PBR a liability.</div>

<p class="lab-step"><span class="n">7</span>Fix it with a probe and a tracked object</p>

```cisco
ip sla 1
 icmp-echo 203.0.113.9 source-interface GigabitEthernet0/2
 frequency 5
ip sla schedule 1 life forever start-time now
!
track 1 ip sla 1 reachability
!
route-map GUEST-OUT-ISPB permit 10
 no set ip next-hop 203.0.113.9
 set ip next-hop verify-availability 203.0.113.9 10 track 1
```

```cisco
R1# show track 1
R1# show ip sla statistics 1
R1# show route-map GUEST-OUT-ISPB
```

<div class="lab-watch"><b>Things to notice</b>
Break ISP-B again and time how long until guest traffic falls back to ISP-A — it should be roughly the probe frequency plus the timeout. Then tune <code>frequency</code> and watch that number change. You now have a failover time you chose rather than one you inherited.
<br><br>Look at <code>show route-map</code> with the object down: the set clause shows <code>[down]</code> and the match counter stops climbing, because the policy is being skipped entirely. That is PBR failing <b>safe</b> — exactly the behaviour absent in step 6.</div>

<p class="lab-step"><span class="n">8</span>Meet the asymmetry you created</p>

With everything working, put an anti-spoofing ACL on ISP-A's side that drops packets sourced from `10.1.90.0/24`, simulating a provider that only accepts traffic from addresses it assigned.

<div class="lab-watch"><b>Things to notice</b>
Guest outbound traffic goes via ISP-B and works. Now fail ISP-B: PBR correctly falls back to ISP-A, and the traffic is <b>dropped by the provider</b> rather than by you. The failover worked perfectly and the service is still down.
<br><br>This is the part of PBR that is a design problem rather than a configuration one. Steering traffic by source across two providers means the source address has to be acceptable to both — which in practice means NAT at each exit, or provider-independent space. Knowing that before you design it is worth more than any command in this article.</div>

<div class="lab-earned"><b>What you earned</b>
You can make a router forward on something other than the destination, and you know that no routing command will ever reveal you did it — so when a packet goes somewhere inexplicable, <code>show ip policy</code> is now an early check rather than a last resort. You know <code>deny</code> exempts and only <code>Null0</code> drops. You have watched a PBR policy black-hole one VLAN while every monitoring signal stayed green, and fixed it with a probe and a tracked object, with a failover time you measured. And you have met the return-path problem, which is the reason source-based steering is a design decision rather than a configuration trick.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>A packet matches a <code>deny</code> clause in a PBR route-map. What happens to it?</p>
<label class="qz-opt"><input type="radio" name="pbr1"><span>It is dropped</span><em class="qz-fb qz-bad">That is ACL thinking. A route-map used for PBR does not discard anything on a deny.</em></label>
<label class="qz-opt"><input type="radio" name="pbr1"><span>PBR stops and the packet is forwarded using the normal routing table</span><em class="qz-fb qz-good">Correct — <code>deny</code> means "exempt from the policy". It is the right way to carve an exception, and the wrong thing to reach for if you want to block traffic.</em></label>
<label class="qz-opt"><input type="radio" name="pbr1"><span>It falls through to the next clause</span><em class="qz-fb qz-bad">That happens when a clause does <em>not</em> match. A matching deny stops processing.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>You configure <code>set ip default next-hop</code> to steer guest traffic, and nothing changes. Why?</p>
<label class="qz-opt"><input type="radio" name="pbr2"><span>Because a route to the destination already exists, so the policy is skipped</span><em class="qz-fb qz-good">Right. <code>default next-hop</code> consults the routing table first and only policy-routes when there is no route — and a default route means there always is one. For steering you want plain <code>set ip next-hop</code>.</em></label>
<label class="qz-opt"><input type="radio" name="pbr2"><span>The command only works on point-to-point links</span><em class="qz-fb qz-bad">That caveat belongs to <code>set interface</code>, not to next-hop commands.</em></label>
<label class="qz-opt"><input type="radio" name="pbr2"><span>It needs <code>verify-availability</code> to function</span><em class="qz-fb qz-bad">Tracking changes failure behaviour, not whether the clause applies.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>You test a new policy by pinging from the router with a source on the matched subnet. It takes the normal path. What does that prove?</p>
<label class="qz-opt"><input type="radio" name="pbr3"><span>The policy is broken</span><em class="qz-fb qz-bad">It proves nothing about the policy at all.</em></label>
<label class="qz-opt"><input type="radio" name="pbr3"><span>Nothing — router-generated packets are not policy routed unless <code>ip local policy</code> is configured</span><em class="qz-fb qz-good">Correct, and it is the commonest false negative in the topic. Test from a host on the subnet, or add <code>ip local policy route-map</code> deliberately.</em></label>
<label class="qz-opt"><input type="radio" name="pbr3"><span>The ACL is matching the wrong direction</span><em class="qz-fb qz-bad">Possible in general, but the source-interface ping would have matched it. The exemption is the reason.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>The policy next hop's router dies but the link stays up. What happens to matched traffic?</p>
<label class="qz-opt"><input type="radio" name="pbr4"><span>It falls back to the routing table automatically</span><em class="qz-fb qz-bad">Only if the next hop leaves the routing table entirely — and a connected subnet does not.</em></label>
<label class="qz-opt"><input type="radio" name="pbr4"><span>It is black-holed, and only the matched traffic is affected</span><em class="qz-fb qz-good">Correct. Everything unmatched keeps working, so monitoring stays green while one subnet is offline. <code>verify-availability</code> with a tracked IP SLA is the fix.</em></label>
<label class="qz-opt"><input type="radio" name="pbr4"><span>The interface goes down and routing reconverges</span><em class="qz-fb qz-bad">The link is up. Nothing tells the router the far device has stopped answering.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Which interface does <code>ip policy route-map</code> go on?</p>
<label class="qz-opt"><input type="radio" name="pbr5"><span>The interface the traffic arrives on</span><em class="qz-fb qz-good">Correct — PBR is an ingress feature, evaluated before the routing lookup. Applying it to the egress interface is the classic "my policy does nothing" fault.</em></label>
<label class="qz-opt"><input type="radio" name="pbr5"><span>The interface the traffic should leave by</span><em class="qz-fb qz-bad">By the time the egress interface is known, the decision PBR exists to make has already been taken.</em></label>
<label class="qz-opt"><input type="radio" name="pbr5"><span>Both, so the policy is symmetric</span><em class="qz-fb qz-bad">PBR is inherently one-directional. Return traffic needs its own policy on its own ingress interface, and often a design conversation instead.</em></label>
</div>

---

## References

- Cisco — [Configure Policy-based Routing with Next-Hop Commands](https://www.cisco.com/c/en/us/support/docs/ip/ip-routed-protocols/47121-pbr-cmds-ce.html) — the authoritative comparison of `set ip next-hop` and `set ip default next-hop`.
- Cisco — [Policy-Based Routing Default Next-Hop Routes](https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/ip-routing/b-ip-routing/m_iri-pbr-default-nexthop-route.html)
- Cisco — [Configuring Policy-Based Routing](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr3-fwd/pbr/policy-based-routing-configuration-guide/m-policy-based-routing-.html) — deny-clause behaviour and the exemption of locally generated packets.

---

*Related: [Redistribution: seed metrics, loops and tags](/blog/route-redistribution-seed-metrics-loops-and-tags) · [NAT and PAT: inside, outside, local, global](/blog/nat-pat-explained-inside-outside-local-global).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
