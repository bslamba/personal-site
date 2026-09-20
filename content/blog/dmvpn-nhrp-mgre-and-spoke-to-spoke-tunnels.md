---
title: "DMVPN: How Two Spokes That Have Never Met Build a Tunnel Directly"
excerpt: "The hub is a phone book, not a traffic cop. Spokes register their real public address with it, and when one needs to reach another the hub hands over the mapping and steps out of the way. One tunnel interface on the hub, however many branches you have."
date: "2026-09-21"
tags: ["DMVPN", "NHRP", "mGRE", "IPsec", "VPN", "WAN", "ENARSI"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 2.3 *Configure and verify DMVPN (single hub)*.

## Cheat sheet

| Piece | Does |
|---|---|
| **mGRE** | **One** tunnel interface reaching **many** peers |
| **NHRP** | The mapping service — tunnel IP → real public IP |
| **IPsec** | Encryption. **Optional**, and bolted on |
| **Routing protocol** | Runs over the tunnel. EIGRP, OSPF or BGP |

| Phase | Spoke-to-spoke? | Routing |
|---|---|---|
| **1** | No — everything via the hub | Hub summarises freely |
| **2** | **Yes**, but next-hop must be preserved | **No summarisation**, spokes need specifics |
| **3** | **Yes**, via NHRP redirect/shortcut | **Summarise again.** What you deploy |

| NHRP command | Does |
|---|---|
| `nhrp network-id` | Groups the cloud. **Must match, locally significant** |
| `nhrp nhs` | Who the Next Hop Server is (the hub) |
| `nhrp map` | Static mapping for the hub — **spokes need this** |
| `nhrp map multicast` | Lets routing protocol hellos flow |
| `nhrp redirect` | **Hub:** tells a spoke to go direct |
| `nhrp shortcut` | **Spoke:** acts on that redirect |

**The sentence that explains the design.** A hub cannot know a branch's dynamic public address in advance, so **the branch tells it** — that registration is NHRP, and everything else follows from it. The hub is a directory that also happens to forward the first few packets.

---

## One interface, many peers

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 285" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spokes register with the hub then build a direct tunnel between themselves">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}.sv1 .hub{fill:#B80027}
  </style>
  <rect class="hub" x="276" y="26" width="90" height="30" rx="3"/><text class="nt" x="321" y="46" text-anchor="middle">HUB</text>
  <text class="m" x="321" y="72" text-anchor="middle">198.51.100.10</text>
  <rect class="n" x="40" y="130" width="94" height="30" rx="3"/><text class="nt" x="87" y="150" text-anchor="middle">SPOKE-1</text>
  <text class="m" x="87" y="176" text-anchor="middle">203.0.113.45</text>
  <rect class="n" x="506" y="130" width="94" height="30" rx="3"/><text class="nt" x="553" y="150" text-anchor="middle">SPOKE-2</text>
  <text class="m" x="553" y="176" text-anchor="middle">192.0.2.77</text>
  <path d="M 110 130 L 290 60" fill="none" stroke="#8A8A93" stroke-width="1.5" stroke-dasharray="4 3"/>
  <path d="M 530 130 L 352 60" fill="none" stroke="#8A8A93" stroke-width="1.5" stroke-dasharray="4 3"/>
  <text class="s" x="168" y="102" fill="#5C5C64">register</text>
  <text class="s" x="440" y="102" fill="#5C5C64">register</text>
  <path d="M 134 152 L 506 152" fill="none" stroke="#1f9d6b" stroke-width="2.5"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 134 152 L 506 152"/></circle>
  <text class="k" x="320" y="144" text-anchor="middle" fill="#0f6b47">direct tunnel — the hub is not in this path</text>
  <rect x="14" y="196" width="612" height="44" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="216" fill="#0f6b47">One mGRE interface on the hub. Add a hundredth branch and change nothing on it.</text>
  <text class="s" x="26" y="232">Classic point-to-point tunnels would mean a hundred tunnel interfaces and a hundred config changes.</text>
  <rect x="14" y="250" width="612" height="30" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="s" x="26" y="270">Spoke public addresses can be dynamic — DHCP, 4G, anything. That is what NHRP registration solves.</text>
</svg>
<figcaption><b>Figure 1.</b> The hub learns where everyone is. Spokes then talk directly, and the hub's configuration never grows.</figcaption>
</figure>

<div class="why">
<b>Two address spaces, and keeping them straight is most of the battle</b>
Every DMVPN device has <b>two</b> relevant addresses. The <b>NBMA address</b> is its real public address on the internet. The <b>tunnel address</b> is its address inside the overlay — typically 10.255.0.x.
<br><br>NHRP's entire job is mapping one to the other. Routing runs over the <b>tunnel</b> addresses; the actual packets travel between <b>NBMA</b> addresses. Confuse them and nothing makes sense: you will try to ping a tunnel address from the underlay, or expect the hub to reach a spoke's tunnel IP before registration has happened.
<br><br>Read every <code>show dmvpn</code> line with this in mind — it prints both, side by side, for exactly this reason.
</div>

---

## The registration, and the shortcut

<div class="walk">
<div class="walk-head">How a direct tunnel comes to exist <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="dmw" id="dm1" checked><label for="dm1"><span class="step-n">1</span>Registration</label>
  <input type="radio" name="dmw" id="dm2"><label for="dm2"><span class="step-n">2</span>First packet</label>
  <input type="radio" name="dmw" id="dm3"><label for="dm3"><span class="step-n">3</span>Redirect</label>
  <input type="radio" name="dmw" id="dm4"><label for="dm4"><span class="step-n">4</span>Phases</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A spoke registers its tunnel address and its real public address with the hub">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="20" y="60" width="96" height="30" rx="3"/><text class="nt" x="68" y="80" text-anchor="middle">SPOKE-1</text>
  <rect class="n" x="510" y="60" width="96" height="30" rx="3"/><text class="nt" x="558" y="80" text-anchor="middle">HUB</text>
  <path d="M 116 70 L 510 70" stroke="#4b7bec" stroke-width="2" fill="none"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 116 70 L 510 70"/></circle>
  <text class="m" x="313" y="60" text-anchor="middle">NHRP Registration Request</text>
  <path d="M 510 96 L 116 96" stroke="#1f9d6b" stroke-width="2" fill="none"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" begin="0.9s" repeatCount="indefinite" path="M 510 96 L 116 96"/></circle>
  <text class="m" x="313" y="114" text-anchor="middle" fill="#0f6b47">Registration Reply</text>
  <text class="k" x="14" y="148">&#8220;My tunnel IP is 10.255.0.11 and you can reach me at 203.0.113.45&#8221;</text>
  <text class="s" x="14" y="172">Refreshed before the holding time expires. The hub builds a mapping table from these, and that</text>
  <text class="s" x="14" y="188">table is the only reason the hub knows where any branch is.</text>
</svg>
<p class="walk-say"><span class="walk-title">The spoke introduces itself</span>
A spoke is configured with the hub's address statically — the hub's address is fixed, so this is possible. It then sends an <b>NHRP Registration Request</b> carrying its own tunnel address and its own NBMA address.
<br><br>The hub records the pair. <b>This is why spoke addresses can be dynamic</b>: nobody had to know them in advance, because the spoke announces itself.
<br><br>Registrations repeat before the holding time expires. A spoke that stops registering ages out of the hub's table, and its branch goes dark — which is why <code>show dmvpn</code> on the hub is the first command for any DMVPN problem.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The first packet between two spokes travels through the hub">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}.sv3 .hub{fill:#B80027}</style>
  <rect class="hub" x="276" y="26" width="86" height="28" rx="3"/><text class="nt" x="319" y="44" text-anchor="middle">HUB</text>
  <rect class="n" x="30" y="112" width="92" height="28" rx="3"/><text class="nt" x="76" y="130" text-anchor="middle">SPOKE-1</text>
  <rect class="n" x="516" y="112" width="92" height="28" rx="3"/><text class="nt" x="562" y="130" text-anchor="middle">SPOKE-2</text>
  <path d="M 100 112 L 290 56" fill="none" stroke="#4b7bec" stroke-width="2"/>
  <path d="M 350 56 L 540 112" fill="none" stroke="#4b7bec" stroke-width="2"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="2s" repeatCount="indefinite" path="M 100 112 L 290 56 L 350 56 L 540 112"/></circle>
  <text class="s" x="319" y="150" text-anchor="middle">no direct tunnel exists yet</text>
  <text class="k" x="14" y="180">Every spoke-to-spoke flow starts by going through the hub. Always.</text>
</svg>
<p class="walk-say"><span class="walk-title">The first packets go the long way</span>
Spoke-1 has no mapping for Spoke-2's real address, so it sends to the only next hop it knows: the hub. The hub forwards it out the same tunnel interface toward Spoke-2.
<br><br>This is normal and unavoidable. <b>Every spoke-to-spoke conversation begins as hub-and-spoke</b> and converts to direct afterwards.
<br><br>Which has a practical consequence worth knowing: <b>the first ping often fails or is slow</b> while the tunnel is being built. Users report "it works the second time", and that is exactly what is happening.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The hub sends a redirect and the spokes resolve each other then build a direct tunnel">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}.sv4 .hub{fill:#B80027}</style>
  <rect class="hub" x="276" y="24" width="86" height="28" rx="3"/><text class="nt" x="319" y="42" text-anchor="middle">HUB</text>
  <rect class="n" x="30" y="104" width="92" height="28" rx="3"/><text class="nt" x="76" y="122" text-anchor="middle">SPOKE-1</text>
  <rect class="n" x="516" y="104" width="92" height="28" rx="3"/><text class="nt" x="562" y="122" text-anchor="middle">SPOKE-2</text>
  <path d="M 290 54 L 100 104" fill="none" stroke="#D3002D" stroke-width="2" stroke-dasharray="5 4"/>
  <text class="m" x="130" y="76" fill="#B80027">redirect</text>
  <path d="M 122 132 L 516 132" fill="none" stroke="#1f9d6b" stroke-width="2.5"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.6s" begin="0.5s" repeatCount="indefinite" path="M 122 132 L 516 132"/></circle>
  <text class="m" x="319" y="152" text-anchor="middle" fill="#0f6b47">Resolution Request / Reply, then a direct tunnel</text>
  <rect x="14" y="166" width="612" height="40" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="186" fill="#0f6b47">nhrp redirect on the hub. nhrp shortcut on the spokes. Both, or nothing happens.</text>
  <text class="s" x="26" y="200">One without the other is the classic Phase 3 fault: everything works, but always via the hub.</text>
</svg>
<p class="walk-say"><span class="walk-title">"You do not need me for this"</span>
The hub notices it is forwarding a packet back out the interface it arrived on, and sends an <b>NHRP redirect</b> to Spoke-1. Spoke-1 then sends a <b>Resolution Request</b> which reaches Spoke-2, and Spoke-2 replies with its NBMA address.
<br><br>Now both have the mapping, and traffic goes directly. If IPsec is configured, the tunnel is negotiated at this point.
<br><br><b>Both commands are required</b>: <code>ip nhrp redirect</code> on the hub and <code>ip nhrp shortcut</code> on the spokes. With only one configured everything works perfectly — <b>via the hub, for ever</b> — and the only symptom is a hub whose traffic graph is much busier than it should be.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Phase one has no spoke to spoke phase two requires specific routes phase three allows summarisation">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv5 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}.sv5 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv5 .ok{fill:rgba(31,157,107,.14);stroke:#1f9d6b}</style>
  <rect class="f" x="14" y="30" width="196" height="88"/>
  <text class="hdr" x="26" y="50">PHASE 1</text>
  <text class="s" x="26" y="70">Hub-and-spoke only.</text>
  <text class="s" x="26" y="88">Spokes are point-to-point.</text>
  <text class="s" x="26" y="106">Summarise freely.</text>
  <rect class="f" x="222" y="30" width="196" height="88"/>
  <text class="hdr" x="234" y="50">PHASE 2</text>
  <text class="s" x="234" y="70">Spoke-to-spoke works, but</text>
  <text class="s" x="234" y="88">spokes need SPECIFIC routes</text>
  <text class="s" x="234" y="106">with next-hop preserved.</text>
  <rect class="ok" x="430" y="30" width="196" height="88"/>
  <text class="hdr" x="442" y="50" fill="#0f6b47">PHASE 3</text>
  <text class="s" x="442" y="70">Spoke-to-spoke via redirect.</text>
  <text class="s" x="442" y="88">Summarise again — NHRP</text>
  <text class="s" x="442" y="106">overrides the routing table.</text>
  <rect x="14" y="134" width="612" height="72" fill="rgba(75,123,236,.08)" stroke="#4b7bec"/>
  <text class="k" x="26" y="154" fill="#2f5fd0">Phase 2's constraint is the one that hurts at scale.</text>
  <text class="s" x="26" y="174">Every spoke needs a specific route for every other spoke's networks, so the routing table grows with</text>
  <text class="s" x="26" y="190">the square of the branch count — and you must disable split horizon and next-hop-self to get them.</text>
  <text class="s" x="26" y="204">Phase 3 removes that entirely: a summary is enough, because NHRP installs the shortcut itself.</text>
</svg>
<p class="walk-say"><span class="walk-title">Use Phase 3</span>
<b>Phase 1</b> is hub-and-spoke only — simple, and every packet crosses the hub twice.
<br><br><b>Phase 2</b> added spoke-to-spoke but tied it to the routing table: a spoke can only build a direct tunnel if it has a <b>specific</b> route whose next hop is the other spoke. So no summarisation, and on EIGRP you need <code>no ip split-horizon eigrp</code> and <code>no ip next-hop-self eigrp</code> on the hub. It scales badly.
<br><br><b>Phase 3</b> decouples them. The hub can advertise a summary or even a default, and NHRP installs a more specific shortcut in the forwarding table when a direct tunnel is built. <b>It is what you should deploy</b>, and the older phases are worth knowing mainly because you will inherit them.</p>
</div>
</div>
</div>

---

## The registration, in bytes

<div class="cap">
<div class="cap-head">Capture · NHRP Registration Request <span class="cap-filter">nhrp</span></div>
<div class="cap-hex"><pre>0000  45 00 00 50 4d 21 00 00  40 <mark>2f</mark> c6 f2 <mark>cb 00 71 2d</mark>   E..PM!..@/....q-
0010  <mark>c6 33 64 0a</mark> 00 00 <mark>20 01</mark>  00 01 08 00 00 00 00 00   .3d... .........
0020  00 ff 00 38 00 00 00 00  01 <mark>03</mark> 04 04 00 00 00 00   ................
0030  00 00 00 00 00 01 <mark>cb 00  71 2d</mark> <mark>0a ff 00 0b</mark> 0a ff   ........q-......
0040  00 01 00 20 00 00 05 78  1c 20 04 00 04 00 00 00   ... ...x. ......</pre></div>
<div class="cap-note">
<b>2f</b> — IP protocol 47, GRE. NHRP rides inside GRE, which is why a firewall that permits ESP but not protocol 47 breaks DMVPN in a way that looks like a routing problem.<br>
<b>cb 00 71 2d</b> → <b>c6 33 64 0a</b> — the outer IP header: 203.0.113.45 to 198.51.100.10. <b>Those are the real public addresses</b>, the NBMA layer.<br>
<b>20 01</b> — GRE protocol type 0x2001, NHRP. <b>03</b> at offset 0x29 is the operation type: <b>Registration Request</b>. (01 = Resolution Request, 02 = Resolution Reply, 03 = Registration Request, 04 = Registration Reply — worth knowing, because a capture full of type 01 with no type 02 tells you resolution is failing.)<br>
Then the mandatory part: source NBMA <b>cb 00 71 2d</b> = 203.0.113.45, source protocol address <b>0a ff 00 0b</b> = 10.255.0.11. <b>That pair is the entire point of the packet</b> — the hub now knows that tunnel address 10.255.0.11 lives at public address 203.0.113.45, and can hand that mapping to any other spoke that asks.
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="opt">! HUB</span>
<span class="t">interface Tunnel0</span>
 <span class="t">ip address</span> <span class="opt">10.255.0.1 255.255.255.0</span>
 <span class="t">ip mtu</span> <span class="opt">1400</span>
 <span class="t">ip tcp adjust-mss</span> <span class="opt">1360</span>
 <span class="t">ip nhrp network-id</span> <span class="opt">100</span>
 <span class="t">ip nhrp authentication</span> <span class="opt">DMVPN-K3Y</span>
 <span class="t">ip nhrp map multicast dynamic</span>
 <span class="t">ip nhrp redirect</span>
 <span class="t">tunnel source</span> <span class="opt">GigabitEthernet0/0</span>
 <span class="t">tunnel mode gre multipoint</span>
 <span class="t">tunnel key</span> <span class="opt">100</span>
 <span class="t">tunnel protection ipsec profile</span> <span class="opt">DMVPN-PROF</span>
!
<span class="opt">! SPOKE</span>
<span class="t">interface Tunnel0</span>
 <span class="t">ip address</span> <span class="opt">10.255.0.11 255.255.255.0</span>
 <span class="t">ip mtu</span> <span class="opt">1400</span>
 <span class="t">ip tcp adjust-mss</span> <span class="opt">1360</span>
 <span class="t">ip nhrp network-id</span> <span class="opt">100</span>
 <span class="t">ip nhrp authentication</span> <span class="opt">DMVPN-K3Y</span>
 <span class="t">ip nhrp map</span> <span class="opt">10.255.0.1 198.51.100.10</span>
 <span class="t">ip nhrp map multicast</span> <span class="opt">198.51.100.10</span>
 <span class="t">ip nhrp nhs</span> <span class="opt">10.255.0.1</span>
 <span class="t">ip nhrp shortcut</span>
 <span class="t">tunnel source</span> <span class="opt">GigabitEthernet0/0</span>
 <span class="t">tunnel mode gre multipoint</span>
 <span class="t">tunnel key</span> <span class="opt">100</span>
 <span class="t">tunnel protection ipsec profile</span> <span class="opt">DMVPN-PROF</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>tunnel mode gre <br>multipoint</dt><dd><b>The line that makes it DMVPN.</b> Without it you have a point-to-point GRE tunnel with a <code>tunnel destination</code>, and one interface per branch. mGRE has no destination — NHRP supplies it per packet.</dd></div>
<div class="is-key"><dt>ip mtu 1400<br>ip tcp adjust-mss 1360</dt><dd><b>The two lines everybody forgets, and the resulting fault is horrible to diagnose.</b> GRE adds 24 bytes and IPsec adds more, so a full-size packet exceeds the path MTU. Pings work, SSH works, and <b>large transfers and some websites hang</b> — because the DF bit is set and the ICMP "fragmentation needed" is being dropped by somebody's firewall. Set both and it goes away.</dd></div>
<div class="is-key"><dt>ip nhrp network-id</dt><dd>Groups interfaces into one DMVPN cloud. <b>It is locally significant</b> — it does not have to match between routers, though it always does in practice because nobody wants to explain why it does not.</dd></div>
<div><dt>ip nhrp authentication</dt><dd><b>Plain text</b> — it stops accidental cross-registration between clouds, not an attacker. Real security is the IPsec profile.</dd></div>
<div class="is-key"><dt>ip nhrp map multicast <br>dynamic <i>(hub)</i></dt><dd><b>"Add each registering spoke to my multicast list."</b> Without it the hub cannot send multicast down the tunnel, so EIGRP and OSPF hellos never reach the spokes and <b>no routing adjacency forms</b> — while NHRP registration succeeds and <code>show dmvpn</code> looks perfectly healthy. A deeply confusing combination.</dd></div>
<div><dt>ip nhrp map / nhs <i>(spoke)</i></dt><dd>The spoke needs the hub's mapping statically, because it has to reach the hub before it can ask anyone anything. <code>nhs</code> names the hub as the Next Hop Server.</dd></div>
<div class="is-key"><dt>redirect <i>(hub)</i><br>shortcut <i>(spoke)</i></dt><dd><b>Phase 3, and you need both.</b> The hub redirects; the spoke acts on it. Configure one without the other and every spoke-to-spoke flow silently stays on the hub for ever.</dd></div>
<div><dt>tunnel key 100</dt><dd>Lets several DMVPN clouds share one tunnel source. Must match everywhere in the cloud, and a mismatch is invisible in <code>show ip int brief</code>.</dd></div>
<div><dt>tunnel protection <br>ipsec profile</dt><dd>Encryption, applied to the tunnel rather than via a crypto map. <b>Optional</b> — DMVPN is a topology mechanism and works without it, though across the internet you would not.</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>SPOKE-1 — one command tells you almost everything</div>
<pre><span class="p">SPOKE-1#</span> <span class="c">show dmvpn</span>
Interface: Tunnel0, IPv4 NHRP Details
Type:Spoke, NHRP Peers:2,

 # Ent  Peer NBMA Addr   Peer Tunnel Add  State  UpDn Tm  Attrb
 ----- ---------------  ---------------  -----  --------  -----
     1   198.51.100.10      10.255.0.1     <span class="g">UP</span>  04:12:55     <span class="y">S</span>
     1        192.0.2.77     10.255.0.12    <span class="g">UP</span>  00:01:09     <span class="y">D</span>

<span class="o">! Attrb S = Static (the hub, from your config).  D = Dynamic — a spoke-to-spoke</span>
<span class="o">! tunnel that NHRP built by itself. Seeing a D entry is the proof Phase 3 works.</span>
<span class="o">! Only ever S entries = redirect or shortcut is missing.</span>

<span class="p">SPOKE-1#</span> <span class="c">show ip nhrp</span>
10.255.0.12/32 via 10.255.0.12
   Tunnel0 created 00:01:09, expire <span class="y">01:58:51</span>
   Type: dynamic, Flags: router used nhop
   NBMA address: 192.0.2.77

<span class="p">SPOKE-1#</span> <span class="c">show crypto ipsec sa | include local|remote|pkts</span>
   local  ident (addr/mask): (203.0.113.45/255.255.255.255/47/0)
   remote ident (addr/mask): (192.0.2.77/255.255.255.255/47/0)
    #pkts encaps: 84121, #pkts encrypt: 84121
    #pkts decaps: <span class="r">0</span>, #pkts decrypt: <span class="r">0</span>

<span class="o">! Encrypting but not decrypting = one direction only. Almost always NAT or a</span>
<span class="o">! firewall dropping ESP or protocol 47 on the return path.</span>

<span class="p">SPOKE-1#</span> <span class="c">show ip route eigrp | include 10.2</span>
D       10.2.0.0/16 [90/26880256] via 10.255.0.1, 04:10:22, Tunnel0
<span class="o">! Routing still points at the HUB — and that is correct in Phase 3.</span>
<span class="o">! NHRP installs the shortcut in CEF, not in the routing table. Check</span>
<span class="o">! "show ip cef 10.2.20.99" to see the real next hop.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The last one catches everyone.</b> In Phase 3 the routing table keeps pointing at the hub even when a direct tunnel is active — the shortcut lives in CEF. So "my route still says hub" is not evidence that spoke-to-spoke is broken. <code>show dmvpn</code> showing a <b>D</b> entry is.</p>

<div class="real">
<b>In the real world</b>
DMVPN's appeal is operational rather than technical: <b>adding a branch changes nothing on the hub.</b> Ship a pre-staged router to the site, plug it into whatever internet is available, and it registers itself. That is the whole value proposition, and it is why DMVPN outlived several attempts to replace it.
<br><br>What actually goes wrong in production is almost never NHRP. It is <b>MTU</b> — the fault where ping works and file transfers hang — and <b>NAT</b>, where a spoke behind a NAT device registers an address the hub cannot reach back to. Both look like routing problems and neither is.
<br><br>SD-WAN is the successor, and it is DMVPN's idea with central policy and a proper controller. Understanding this makes that one much easier to learn.
</div>

---

## What goes wrong

**NHRP registers, no routing adjacency.** Missing `ip nhrp map multicast dynamic` on the hub.

**Everything works but always via the hub.** `redirect` or `shortcut` missing.

**Ping works, large transfers hang.** MTU. Set `ip mtu 1400` and `ip tcp adjust-mss 1360`.

**Encrypting but not decrypting.** Return path blocked — ESP or protocol 47 filtered, or NAT.

**Spoke behind NAT never registers.** The hub cannot reach the registered address.

**Tunnel up, no traffic.** `tunnel key` mismatch.

**Phase 2 spokes will not go direct.** They need specific routes with the next hop preserved.

---

<div class="lab">
<div class="lab-head">Lab — build it, watch a tunnel appear, then break it four ways</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a single-hub DMVPN with two spokes and capture the moment a direct spoke-to-spoke tunnel is created. Then produce the four faults that account for nearly every real DMVPN problem: no multicast mapping, no redirect, MTU, and a Phase 2 summarisation trap.</div>

**Topology.** Hub with a static public address, two spokes, and a "internet" router in between doing plain IP routing with **no knowledge of the tunnel addresses**. Loopbacks behind each spoke to generate traffic. EIGRP over the tunnel.

<p class="lab-step"><span class="n">1</span>Underlay first, and keep it separate in your head</p>

Get every device's **public** address reachable. Do not configure any tunnel yet.

<div class="lab-watch"><b>Things to notice</b>
Ping hub-to-spoke on the <b>public</b> addresses. That is the NBMA layer, and it must work before anything else can.
<br><br>Confirm the intermediate router has <b>no route to 10.255.0.0/24</b>. It never will — that network exists only inside the tunnel. <b>Keeping these two layers separate is the single most useful habit for this topic.</b></div>

<p class="lab-step"><span class="n">2</span>Tunnels up, registration visible</p>

Configure Tunnel0 on all three, then capture on the spoke's outside interface while it registers.

```cisco
SPOKE-1# show dmvpn
SPOKE-1# debug nhrp packet
```

<div class="lab-watch"><b>Things to notice</b>
Find the <b>Registration Request</b> in the capture and locate both addresses inside it: the source NBMA (public) and the source protocol address (tunnel). <b>Those two values are the entire purpose of the packet.</b>
<br><br>On the hub, <code>show ip nhrp</code> now lists both spokes with an expiry timer. Shut a spoke's outside interface and watch it age out — then bring it back and watch registration happen again within seconds.</div>

<p class="lab-step"><span class="n">3</span>Omit the multicast mapping</p>

Leave `ip nhrp map multicast dynamic` off the hub and configure EIGRP over the tunnel.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Adjacency forms anyway</b> — you have a static multicast map left over, or you are using BGP, which is unicast.</li>
<li><b>Everything is down</b> — check the tunnel is up first; this test needs a working tunnel.</li>
<li><b>Adjacency flaps</b> — that is an MTU problem arriving early; note it and continue.</li>
</ul>
<b>NHRP registers perfectly. <code>show dmvpn</code> shows UP. And no EIGRP neighbour forms</b>, because hellos are multicast and the hub has nowhere to send them. That combination — NHRP healthy, routing dead — is worth experiencing once so you recognise it instantly.</div>

<p class="lab-step"><span class="n">4</span>Watch a spoke-to-spoke tunnel be born</p>

With everything working, ping from Spoke-1's loopback to Spoke-2's loopback while running `debug nhrp packet`.

<div class="lab-watch"><b>Things to notice</b>
<b>The first ping often fails or is slow.</b> Then in the debug: a redirect from the hub, a Resolution Request, a Resolution Reply, and a new <b>D</b> entry in <code>show dmvpn</code>.
<br><br>Check <code>show ip route</code> — it <b>still points at the hub</b>. Then <code>show ip cef 10.2.20.99</code> and see the real next hop is now Spoke-2. <b>That discrepancy is correct Phase 3 behaviour</b>, and knowing it saves you from "fixing" a working network.
<br><br>Now remove <code>ip nhrp shortcut</code> from the spoke and repeat: no D entry ever appears, everything still works via the hub, and <b>nothing reports a problem</b>.</div>

<p class="lab-step"><span class="n">5</span>The MTU fault, properly reproduced</p>

Remove `ip mtu` and `ip tcp adjust-mss`. Ping with a small size — fine. Then:

```bash
ping 10.2.20.99 size 1500 df-bit
```

<div class="lab-watch"><b>Things to notice</b>
Small pings succeed, <b>large ones with DF set fail</b>. Then try a large file transfer or a TCP session and watch it <b>hang rather than fail cleanly</b> — which is what users actually report.
<br><br>Add both lines back and repeat. <b>Time how long it took you to diagnose it without them</b>; that is why they are in every DMVPN template ever written.</div>

<p class="lab-step"><span class="n">6</span>Phase 2's summarisation trap</p>

Remove `redirect`/`shortcut` to force Phase 2 behaviour, and summarise the spoke networks on the hub.

<div class="lab-watch"><b>Things to notice</b>
Spoke-to-spoke tunnels <b>stop being built</b>. With only a summary, a spoke has no specific route whose next hop is the other spoke, and Phase 2 requires exactly that.
<br><br>Add <code>no ip split-horizon eigrp</code> and <code>no ip next-hop-self eigrp</code> on the hub, remove the summary, and they work again — <b>at the cost of every spoke holding a route for every other spoke.</b> Then put Phase 3 back and summarise once more: direct tunnels return <i>and</i> the routing tables stay small. <b>That contrast is the argument for Phase 3 in one lab step.</b></div>

<div class="lab-earned"><b>What you earned</b>
You can keep the NBMA and tunnel address spaces separate, which is most of what makes DMVPN confusing. You have read a Registration Request and found both addresses in it. You have watched a direct tunnel be created and know that in Phase 3 the routing table still points at the hub while CEF does not. You have produced the NHRP-healthy-routing-dead fault from a missing multicast map, the silent everything-via-the-hub fault from a missing shortcut, and the MTU fault where ping works and transfers hang. And you have measured why Phase 3 replaced Phase 2.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What does NHRP actually do?</p>
<label class="qz-opt"><input type="radio" name="dq1"><span>Maps tunnel (overlay) addresses to real NBMA (public) addresses</span><em class="qz-fb qz-good">Correct — it is the directory that lets spokes with dynamic public addresses be found.</em></label>
<label class="qz-opt"><input type="radio" name="dq1"><span>Encrypts the tunnel</span><em class="qz-fb qz-bad">That is IPsec, and it is optional.</em></label>
<label class="qz-opt"><input type="radio" name="dq1"><span>Routes traffic between spokes</span><em class="qz-fb qz-bad">A routing protocol does that. NHRP supplies the mapping.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>NHRP registers successfully and <code>show dmvpn</code> shows UP, but no EIGRP neighbour forms. Cause?</p>
<label class="qz-opt"><input type="radio" name="dq2"><span>Missing <code>ip nhrp map multicast dynamic</code> on the hub</span><em class="qz-fb qz-good">Correct — EIGRP hellos are multicast and the hub has no list of who to send them to.</em></label>
<label class="qz-opt"><input type="radio" name="dq2"><span>Tunnel key mismatch</span><em class="qz-fb qz-bad">That would stop the tunnel coming up at all.</em></label>
<label class="qz-opt"><input type="radio" name="dq2"><span>Wrong network-id</span><em class="qz-fb qz-bad">Network-id is locally significant.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Everything works but all spoke-to-spoke traffic goes via the hub. What is missing?</p>
<label class="qz-opt"><input type="radio" name="dq3"><span><code>ip nhrp redirect</code> on the hub or <code>ip nhrp shortcut</code> on the spokes</span><em class="qz-fb qz-good">Correct — you need both, and with one missing nothing reports an error at all.</em></label>
<label class="qz-opt"><input type="radio" name="dq3"><span>IPsec is not configured</span><em class="qz-fb qz-bad">IPsec is optional and unrelated to path selection.</em></label>
<label class="qz-opt"><input type="radio" name="dq3"><span>The spokes cannot reach each other's public addresses</span><em class="qz-fb qz-bad">Possible, but then <code>show dmvpn</code> would show resolution failing rather than silent success.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>Pings succeed but large transfers hang. What is it?</p>
<label class="qz-opt"><input type="radio" name="dq4"><span>MTU — GRE and IPsec overhead, with path MTU discovery blocked</span><em class="qz-fb qz-good">Correct. <code>ip mtu 1400</code> and <code>ip tcp adjust-mss 1360</code> on the tunnel.</em></label>
<label class="qz-opt"><input type="radio" name="dq4"><span>NHRP holding time expired</span><em class="qz-fb qz-bad">Then small pings would fail too.</em></label>
<label class="qz-opt"><input type="radio" name="dq4"><span>Routing protocol misconfiguration</span><em class="qz-fb qz-bad">Routing does not distinguish by packet size.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>In Phase 3, a spoke's routing table still points at the hub while a direct tunnel is active. Why?</p>
<label class="qz-opt"><input type="radio" name="dq5"><span>NHRP installs the shortcut in CEF, not in the routing table</span><em class="qz-fb qz-good">Correct — check <code>show ip cef</code> and the <b>D</b> entry in <code>show dmvpn</code>, not the routing table.</em></label>
<label class="qz-opt"><input type="radio" name="dq5"><span>The direct tunnel is not really being used</span><em class="qz-fb qz-bad">It is — the forwarding path differs from the routing table by design.</em></label>
<label class="qz-opt"><input type="radio" name="dq5"><span>The routing protocol has not converged</span><em class="qz-fb qz-bad">It has; the route pointing at the hub is the expected steady state.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Why can Phase 3 summarise when Phase 2 cannot?</p>
<label class="qz-opt"><input type="radio" name="dq6"><span>Phase 3 uses NHRP redirects, so it does not need a specific route to trigger a direct tunnel</span><em class="qz-fb qz-good">Correct — Phase 2 tied spoke-to-spoke to the routing table, which is why it scales badly.</em></label>
<label class="qz-opt"><input type="radio" name="dq6"><span>Phase 3 uses a different tunnel mode</span><em class="qz-fb qz-bad">Both use mGRE.</em></label>
<label class="qz-opt"><input type="radio" name="dq6"><span>Phase 3 does not support spoke-to-spoke</span><em class="qz-fb qz-bad">It supports it better than Phase 2 does.</em></label>
</div>

---

## References

- **RFC 2332** — *NBMA Next Hop Resolution Protocol (NHRP)*. The packet format in the capture above.
- **RFC 2784** — *Generic Routing Encapsulation (GRE)*.
- Cisco — [DMVPN Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_conn_dmvpn/configuration/xe-17/sec-conn-dmvpn-xe-17-book.html)
- Cisco — [DMVPN Design Guide](https://www.cisco.com/c/en/us/td/docs/solutions/CVD/Aug2014/CVD-DMVPNDesignGuide-AUG14.html) — where the phase comparison comes from.

---

*Related: [VRF-Lite and GRE tunnels](/blog/vrf-lite-and-gre-tunnels-explained) · [IPsec: IKEv1 phase 1 and phase 2](/blog/ipsec-ikev1-phase-1-and-phase-2-explained) · [MPLS and L3VPN](/blog/mpls-lsr-ldp-label-switching-and-l3vpn).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
