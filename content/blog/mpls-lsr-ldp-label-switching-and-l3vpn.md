---
title: "MPLS and L3VPN: Two Labels, and Why Your Provider Can Carry Everyone's 10.0.0.0/8"
excerpt: "The core routers carrying your traffic have never heard of your networks and never will. That is not a simplification — it is the whole design. One label says where the packet goes, a second says whose it is, and the middle of the network only ever reads the first one."
date: "2026-09-21"
tags: ["MPLS", "LDP", "L3VPN", "VRF", "MP-BGP", "Service Provider", "ENARSI"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 2.1 *Describe MPLS operations (LSR, LDP, label switching, LSP)*, 2.2 *Describe MPLS Layer 3 VPN*.

## Cheat sheet

| Role | Is | Does |
|---|---|---|
| **CE** | Customer edge | An ordinary router. **Knows nothing about MPLS** |
| **PE** | Provider edge | **Where the complexity lives.** VRFs, MP-BGP, imposes labels |
| **P** | Provider core | **Swaps one label.** Has no customer routes at all |
| **LSR** | Any label-switching router | Swap, push or pop |
| **LSP** | Label switched path | The unidirectional path a label follows |

| Label operation | Where |
|---|---|
| **Push** | Ingress PE — label added |
| **Swap** | P routers — one label out, another in |
| **Pop** | Egress, or one hop earlier (**PHP**) |

| The 32-bit label | Bits |
|---|---|
| **Label** | 20 — values 0–15 reserved |
| **EXP / TC** | 3 — QoS, copied from DSCP |
| **S** | **1 — bottom of stack.** The only end marker |
| **TTL** | 8 — copied in, copied back out |

| L3VPN piece | Does |
|---|---|
| **VRF** | A separate routing table per customer on the PE |
| **RD** | 8 bytes prepended to make `10.0.0.0/8` **unique** across customers |
| **RT** | Export/import community — **controls who sees what** |
| **VPNv4** | RD + IPv4 prefix = a 96-bit address family |
| **MP-BGP** | Carries VPNv4 routes **PE to PE only** |

**The sentence that makes L3VPN click.** The RD makes prefixes *unique*; the RT decides *who imports them*. They are different jobs and people constantly conflate them — which is why "my routes are in BGP but not in the customer's VRF" is nearly always an RT mismatch, never an RD one.

---

## The core does not know your routes

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 275" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Customer edge routers peer with provider edge routers while the provider core only switches labels">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}.sv1 .pe{fill:#B80027}
  </style>
  <rect class="n" x="14" y="56" width="66" height="28" rx="3"/><text class="nt" x="47" y="74" text-anchor="middle">CE-A</text>
  <rect class="pe" x="106" y="56" width="66" height="28" rx="3"/><text class="nt" x="139" y="74" text-anchor="middle">PE-1</text>
  <rect class="n" x="212" y="56" width="58" height="28" rx="3"/><text class="nt" x="241" y="74" text-anchor="middle">P</text>
  <rect class="n" x="310" y="56" width="58" height="28" rx="3"/><text class="nt" x="339" y="74" text-anchor="middle">P</text>
  <rect class="pe" x="408" y="56" width="66" height="28" rx="3"/><text class="nt" x="441" y="74" text-anchor="middle">PE-2</text>
  <rect class="n" x="514" y="56" width="66" height="28" rx="3"/><text class="nt" x="547" y="74" text-anchor="middle">CE-B</text>
  <line x1="80" y1="70" x2="106" y2="70" stroke="#8A8A93" stroke-width="2"/>
  <line x1="172" y1="70" x2="212" y2="70" stroke="#4b7bec" stroke-width="2"/>
  <line x1="270" y1="70" x2="310" y2="70" stroke="#4b7bec" stroke-width="2"/>
  <line x1="368" y1="70" x2="408" y2="70" stroke="#4b7bec" stroke-width="2"/>
  <line x1="474" y1="70" x2="514" y2="70" stroke="#8A8A93" stroke-width="2"/>
  <text class="s" x="47" y="104" text-anchor="middle">plain IP</text>
  <text class="s" x="290" y="104" text-anchor="middle" fill="#2f5fd0">labels only</text>
  <text class="s" x="547" y="104" text-anchor="middle">plain IP</text>
  <path d="M 139 96 C 200 150, 380 150, 441 96" fill="none" stroke="#B80027" stroke-width="1.5" stroke-dasharray="5 4"/>
  <text class="m" x="290" y="150" text-anchor="middle" fill="#B80027">MP-BGP VPNv4 — PE to PE, straight over the top</text>
  <rect x="14" y="170" width="612" height="46" fill="rgba(75,123,236,.08)" stroke="#4b7bec"/>
  <text class="k" x="26" y="190" fill="#2f5fd0">The P routers have no VRFs, no customer routes, and no BGP session with anyone.</text>
  <text class="s" x="26" y="208">They hold one label table. That is why a provider core scales to thousands of customers on hardware</text>
  <rect x="14" y="226" width="612" height="44" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="246" fill="#0f6b47">And the CE is an ordinary router running OSPF or BGP to its PE.</text>
  <text class="s" x="26" y="264">No MPLS, no VRF, no awareness that any of this exists. That is the product being sold.</text>
</svg>
<figcaption><b>Figure 1.</b> Complexity concentrated at the edges, simplicity in the middle — the opposite of how most networks are built, and the reason this one scales.</figcaption>
</figure>

<div class="why">
<b>Why labels at all, when routers can already forward IP?</b>
The original reason was speed: a fixed-length label lookup was far faster than a longest-prefix match in 1997. <b>That reason is obsolete</b> — modern hardware does longest-prefix match at line rate.
<br><br>The reason MPLS is still everywhere is what the label lets you do: <b>forward on something other than the destination address.</b> A label can mean "this customer's traffic", "this traffic-engineered path", "this pseudowire". Once forwarding is decoupled from the destination IP, VPNs and traffic engineering become possible — and <b>those</b> are why MPLS survived.
</div>

---

## Follow one packet

<div class="walk">
<div class="walk-head">A packet from CE-A to CE-B <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="mpw" id="mp1" checked><label for="mp1"><span class="step-n">1</span>Push two</label>
  <input type="radio" name="mpw" id="mp2"><label for="mp2"><span class="step-n">2</span>Swap</label>
  <input type="radio" name="mpw" id="mp3"><label for="mp3"><span class="step-n">3</span>PHP</label>
  <input type="radio" name="mpw" id="mp4"><label for="mp4"><span class="step-n">4</span>The VPN label</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The ingress provider edge pushes a VPN label and a transport label onto the packet">
  <style>.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .t{fill:rgba(75,123,236,.18);stroke:#4b7bec}.sv2 .v{fill:rgba(211,0,45,.14);stroke:#D3002D}.sv2 .f{fill:#F1EEE9;stroke:#B5B5BC}</style>
  <rect class="t" x="14" y="36" width="150" height="34"/><text class="m" x="89" y="58" text-anchor="middle">1201  transport</text>
  <rect class="v" x="168" y="36" width="150" height="34"/><text class="m" x="243" y="58" text-anchor="middle">1001  VPN  S=1</text>
  <rect class="f" x="322" y="36" width="304" height="34"/><text class="m" x="474" y="58" text-anchor="middle">the customer's IP packet, untouched</text>
  <text class="s" x="89" y="86" text-anchor="middle">outer — from LDP</text>
  <text class="s" x="243" y="86" text-anchor="middle">inner — from MP-BGP</text>
  <text class="k" x="14" y="124">Outer = WHERE it goes. Inner = WHOSE it is.</text>
  <text class="s" x="14" y="148">The transport label gets it across the core to the egress PE. The VPN label tells that PE which</text>
  <text class="s" x="14" y="164">customer VRF to put it in when it arrives. Two completely different questions, two labels.</text>
  <text class="s" x="14" y="188">The inner label has <tspan font-family="ui-monospace,Menlo,monospace">S=1</tspan> — bottom of stack. It is the only marker saying &#8220;IP header follows&#8221;.</text>
</svg>
<p class="walk-say"><span class="walk-title">The ingress PE pushes two</span>
The customer's packet arrives as plain IP on a VRF interface. PE-1 looks it up in <b>that customer's VRF</b>, finds a VPNv4 route learned from PE-2, and pushes:
<br><br><b>Inner — the VPN label</b>, allocated by PE-2 and advertised in MP-BGP. It identifies the customer at the far end. <b>Outer — the transport label</b>, learned by LDP, which gets the packet to PE-2's loopback.
<br><br>There is no protocol field in a label. <b>The S bit is the only thing that says where the stack ends</b> and an IP header begins.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Each provider core router swaps the outer label and never looks deeper">
  <style>.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .n{fill:#17171A}.sv3 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}.sv3 .t{fill:rgba(75,123,236,.18);stroke:#4b7bec}</style>
  <rect class="n" x="20" y="60" width="58" height="26" rx="3"/><text class="nt" x="49" y="77" text-anchor="middle">PE-1</text>
  <rect class="n" x="180" y="60" width="58" height="26" rx="3"/><text class="nt" x="209" y="77" text-anchor="middle">P1</text>
  <rect class="n" x="340" y="60" width="58" height="26" rx="3"/><text class="nt" x="369" y="77" text-anchor="middle">P2</text>
  <rect class="n" x="500" y="60" width="58" height="26" rx="3"/><text class="nt" x="529" y="77" text-anchor="middle">PE-2</text>
  <line x1="78" y1="73" x2="180" y2="73" stroke="#4b7bec" stroke-width="2"/>
  <line x1="238" y1="73" x2="340" y2="73" stroke="#4b7bec" stroke-width="2"/>
  <line x1="398" y1="73" x2="500" y2="73" stroke="#4b7bec" stroke-width="2"/>
  <text class="m" x="129" y="50" text-anchor="middle">1201</text>
  <text class="m" x="289" y="50" text-anchor="middle">3055</text>
  <text class="m" x="449" y="50" text-anchor="middle">pop</text>
  <text class="s" x="209" y="106" text-anchor="middle">swap</text>
  <text class="s" x="369" y="106" text-anchor="middle">swap</text>
  <text class="k" x="14" y="142">Labels have LOCAL significance. 1201 means something only to P1.</text>
  <text class="s" x="14" y="166">Each LSR reads the top label, looks it up in the LFIB, swaps it for the one its downstream</text>
  <text class="s" x="14" y="182">neighbour asked for, and forwards. It never reads the inner label or the IP header.</text>
</svg>
<p class="walk-say"><span class="walk-title">Swap, and keep going</span>
Each P router does one lookup: top label in, top label out, forward. <b>The label value changes at every hop</b> because each router advertised its own value to its upstream neighbour — labels are locally significant, not end to end.
<br><br>This is why P routers need no customer state. They hold one LFIB keyed on labels, and a packet for any of a thousand customers is handled by the same entry as long as it is heading to the same egress PE.
<br><br>It is also why <b>traceroute across an MPLS core looks strange</b>: TTL is copied into the label and decremented there, so the hops appear — or do not, if the provider disables TTL propagation to hide their topology.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Penultimate hop popping removes the outer label one hop before the egress router">
  <style>.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .n{fill:#17171A}.sv4 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}</style>
  <rect class="n" x="60" y="56" width="66" height="28" rx="3"/><text class="nt" x="93" y="74" text-anchor="middle">P2</text>
  <rect class="n" x="400" y="56" width="66" height="28" rx="3"/><text class="nt" x="433" y="74" text-anchor="middle">PE-2</text>
  <line x1="126" y1="70" x2="400" y2="70" stroke="#4b7bec" stroke-width="2"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 126 70 L 400 70"/></circle>
  <text class="m" x="263" y="52" text-anchor="middle">only the VPN label left</text>
  <text class="s" x="263" y="98" text-anchor="middle">PE-2 does ONE lookup instead of two</text>
  <text class="k" x="14" y="136">PE-2 advertises the special label 3 — &#8220;implicit null&#8221; — meaning &#8220;pop it before you send&#8221;.</text>
  <text class="s" x="14" y="160">Without PHP the egress PE would pop the transport label, then look up the VPN label: two lookups</text>
  <text class="s" x="14" y="176">in one pass. PHP moves the first one upstream, where the router was doing a lookup anyway.</text>
</svg>
<p class="walk-say"><span class="walk-title">Penultimate hop popping</span>
The <b>second to last</b> router removes the transport label, so the egress PE receives a packet with only the VPN label on it. This is signalled by the egress advertising label <b>3, "implicit null"</b>.
<br><br>It exists purely for efficiency — it saves the egress PE a lookup, on the device that is already doing the most work in the network.
<br><br>The practical consequence is visible in captures: <b>on the last core link you will see a single-label packet</b>, not two. People chasing a VPN problem often see this and conclude the transport label is missing. It is not; it was removed deliberately one hop early.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 205" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The route distinguisher makes overlapping customer prefixes unique and route targets control import">
  <style>.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .a{fill:rgba(75,123,236,.16);stroke:#4b7bec}.sv5 .b{fill:rgba(31,157,107,.16);stroke:#1f9d6b}</style>
  <rect class="a" x="14" y="30" width="300" height="30"/><text class="m" x="26" y="50">65000:100</text><text class="m" x="140" y="50">: 10.0.0.0/8</text>
  <rect class="b" x="326" y="30" width="300" height="30"/><text class="m" x="338" y="50">65000:200</text><text class="m" x="452" y="50">: 10.0.0.0/8</text>
  <text class="s" x="164" y="76" text-anchor="middle">customer A</text>
  <text class="s" x="476" y="76" text-anchor="middle">customer B</text>
  <text class="k" x="14" y="108">Same prefix. Different RD. Two distinct VPNv4 routes, and BGP keeps both.</text>
  <text class="s" x="14" y="134">The RD is not policy — it carries no meaning beyond making the prefix unique. It is 8 bytes of</text>
  <text class="s" x="14" y="150">disambiguation, and that is all it does.</text>
  <text class="k" x="14" y="180" fill="#0f6b47">The ROUTE TARGET is the policy: export 65000:100, import 65000:100.</text>
  <text class="s" x="14" y="200">Change an import RT and a customer sees a different set of routes. That is how hub-and-spoke</text>
</svg>
<p class="walk-say"><span class="walk-title">RD makes it unique; RT decides who gets it</span>
Every customer uses 10.0.0.0/8. BGP cannot hold the same prefix twice — so the PE prepends an 8-byte <b>Route Distinguisher</b>, producing a 96-bit VPNv4 route that is unique per customer.
<br><br>The <b>Route Target</b> is a separate thing entirely: an extended community attached on export and matched on import. <b>The RT is the policy.</b> Import the same RT into two VRFs and they can reach each other; import a hub's RT into every spoke but not each other's and you have hub-and-spoke.
<br><br>People set RD and RT to the same value out of habit and then assume they are the same mechanism. <b>They are not</b>, and the day you build extranet or shared-services access, that assumption costs you an afternoon.</p>
</div>
</div>
</div>

---

## The labels, in bytes

<div class="cap">
<div class="cap-head">Capture · MPLS L3VPN, two-label stack <span class="cap-filter">mpls</span></div>
<div class="cap-hex"><pre>0000  00 de ad be ef 01 00 1a  2b 3c 4d 5e <mark>88 47</mark> <mark>00 4b</mark>   ........+&lt;M^.G.K
0010  <mark>1a fe</mark> <mark>00 3e 91 fe</mark> 45 00  00 3c 4d 21 00 00 40 01   ...&gt;..E..&lt;M!..@.
0020  fb 08 <mark>0a 01 0a 32</mark> <mark>0a 02  14 63</mark> 08 00 00 00 00 00   .....2...c......
0030  00 00 00 01 02 03 04 05  06 07 08 09 0a 0b 0c 0d   ................</pre></div>
<div class="cap-note">
<b>88 47</b> — EtherType for MPLS unicast. Everything after it is labels until the S bit says otherwise.<br>
<b>00 4b 1a fe</b> — outer label. Decoded: label <b>1201</b>, EXP <b>5</b>, <b>S=0</b>, TTL 254. EXP 5 means the QoS marking was copied down from the IP DSCP at the ingress PE, so the core can prioritise without reading the IP header.<br>
<b>00 3e 91 fe</b> — inner label. Label <b>1001</b>, EXP 0, <b>S=1</b> — bottom of stack, so an IP header starts immediately after.<br>
And there it is: <b>45 00</b> begins the customer's IP packet, source <b>0a 01 0a 32</b> = 10.1.10.50 to <b>0a 02 14 63</b> = 10.2.20.99. <b>The core router forwarding this frame read the first four bytes after the EtherType and nothing else.</b> It has no idea those addresses exist.
</div>
</div>

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="opt">! the core — this is all a P router needs</span>
<span class="t">mpls ip</span>
<span class="t">mpls label protocol ldp</span>
<span class="t">mpls ldp router-id</span> <span class="opt">Loopback0</span> <span class="t">force</span>
!
<span class="t">interface</span> <span class="opt">GigabitEthernet0/1</span>
 <span class="t">mpls ip</span>
!
<span class="opt">! the PE — where everything actually happens</span>
<span class="t">vrf definition</span> <span class="opt">CUST-A</span>
 <span class="t">rd</span> <span class="opt">65000:100</span>
 <span class="t">address-family ipv4</span>
  <span class="t">route-target export</span> <span class="opt">65000:100</span>
  <span class="t">route-target import</span> <span class="opt">65000:100</span>
!
<span class="t">interface</span> <span class="opt">GigabitEthernet0/2</span>
 <span class="t">vrf forwarding</span> <span class="opt">CUST-A</span>
 <span class="t">ip address</span> <span class="opt">192.168.1.1 255.255.255.252</span>
!
<span class="t">router bgp</span> <span class="opt">65000</span>
 <span class="t">neighbor</span> <span class="opt">10.255.0.2</span> <span class="t">remote-as</span> <span class="opt">65000</span>
 <span class="t">neighbor</span> <span class="opt">10.255.0.2</span> <span class="t">update-source</span> <span class="opt">Loopback0</span>
 <span class="t">address-family vpnv4</span>
  <span class="t">neighbor</span> <span class="opt">10.255.0.2</span> <span class="t">activate</span>
  <span class="t">neighbor</span> <span class="opt">10.255.0.2</span> <span class="t">send-community extended</span>
 <span class="t">address-family ipv4 vrf</span> <span class="opt">CUST-A</span>
  <span class="t">redistribute connected</span>
  <span class="t">neighbor</span> <span class="opt">192.168.1.2</span> <span class="t">remote-as</span> <span class="opt">65100</span>
  <span class="t">neighbor</span> <span class="opt">192.168.1.2</span> <span class="t">activate</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>mpls ip <br>(on the interface)</dt><dd><b>Per interface, and forgetting one is the classic core fault.</b> LDP forms a neighbourship only where both sides have it. A single missing interface leaves a gap where packets arrive labelled and have to be forwarded as IP — which works only if that router happens to have the route, and in a proper core it does not. Traffic disappears with no error anywhere.</dd></div>
<div class="is-key"><dt>mpls ldp router-id <br>Loopback0 force</dt><dd>LDP peers by router ID and <b>the session is built to that address</b>. Without pinning it to a loopback the ID follows an interface, and a link flap tears down LDP sessions that had nothing to do with that link. <code>force</code> applies it immediately rather than at the next restart.</dd></div>
<div class="is-key"><dt>rd 65000:100</dt><dd><b>Makes the prefix unique. It is not policy.</b> Convention is one RD per VRF per PE, and it must be configured before addresses are assigned — changing it later drops and relearns everything in the VRF.</dd></div>
<div class="is-key"><dt>route-target <br>export / import</dt><dd><b>This is the policy, and this is what you get wrong.</b> Export tags routes leaving this VRF; import selects which tagged routes come in. Asymmetric RTs give asymmetric reachability — traffic works one way and not the other, which is confusing until you look at exactly this pair of lines.</dd></div>
<div><dt>vrf forwarding <br>(on the interface)</dt><dd><b>Wipes the interface's IP address when applied.</b> Put the VRF on first, then the address, or you will silently configure an address into the global table and wonder why the CE cannot ping you.</dd></div>
<div class="is-key"><dt>send-community extended</dt><dd><b>Route targets ARE extended communities.</b> Without this the RTs are never transmitted, the far PE imports nothing, and the routes are visible in <code>show bgp vpnv4 all</code> while being absent from every VRF. It is the single most common L3VPN misconfiguration.</dd></div>
<div><dt>address-family vpnv4</dt><dd>Carries RD + prefix + RT + the VPN label. Runs <b>PE to PE only</b> — a P router is never in this session, which is exactly why it holds no customer state.</dd></div>
<div><dt>address-family ipv4 vrf</dt><dd>Where the PE talks to the CE. The CE is an ordinary BGP or OSPF speaker that knows nothing about any of the above.</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>PE-1 — work outward from the label</div>
<pre><span class="p">PE-1#</span> <span class="c">show mpls ldp neighbor | include Peer|State</span>
    Peer LDP Ident: 10.255.0.9:0; Local LDP Ident: 10.255.0.1:0
        State: <span class="g">Oper</span>; Msgs sent/rcvd: 8412/8399

<span class="p">PE-1#</span> <span class="c">show mpls forwarding-table</span>
Local   Outgoing   Prefix            Bytes Label   Outgoing   Next Hop
Label   Label      or Tunnel Id      Switched      interface
1001    No Label   10.2.20.0/24[V]   48219104      Gi0/2      192.168.1.2
16      <span class="y">Pop Label</span>  10.255.0.9/32     1204118       Gi0/1      10.0.12.2
17      3055       10.255.0.2/32     9841002       Gi0/1      10.0.12.2

<span class="o">! "Pop Label" = the downstream router advertised implicit-null. That is PHP.</span>
<span class="o">! "No Label" on a [V] entry = a VRF route handed to the CE as plain IP.</span>

<span class="p">PE-1#</span> <span class="c">show bgp vpnv4 unicast all 10.2.20.0</span>
BGP routing table entry for <span class="y">65000:200:10.2.20.0/24</span>, version 88
  Local
    10.255.0.2 (metric 20) from 10.255.0.2 (10.255.0.2)
      Origin IGP, localpref 100, valid, internal, <span class="g">best</span>
      <span class="y">Extended Community: RT:65000:200</span>
      <span class="y">mpls labels in/out nolabel/1001</span>

<span class="o">! Route is here with RT 65000:200. If the local VRF imports only 65000:100,</span>
<span class="o">! it will NEVER appear in "show ip route vrf" — and nothing reports an error.</span>

<span class="p">PE-1#</span> <span class="c">show ip route vrf CUST-A 10.2.20.0</span>
<span class="r">% Network not in table</span>

<span class="p">PE-1#</span> <span class="c">show vrf detail CUST-A | include Import|Export</span>
  Export VPN route-target communities: RT:65000:100
  Import VPN route-target communities: <span class="r">RT:65000:100</span>
                                       <span class="o">^^^ should be 65000:200</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>That three-command sequence is the whole L3VPN troubleshooting method.</b> Is the route in BGP? Yes. Is it in the VRF? No. Then compare the route's RT against the VRF's import list — they will not match. The route was there the entire time and nothing ever logged a problem.</p>

<div class="real">
<b>In the real world</b>
Most people meet MPLS from the <b>customer</b> side, where the whole thing is invisible: you run BGP or OSPF to the provider's PE and your sites reach each other. What matters then is the SLA, the routing protocol at the handoff, and whether the provider honours your DSCP markings — because the <b>EXP bits</b> are copied from DSCP at the ingress PE, and if that mapping is wrong your QoS stops at the edge of your own network.
<br><br>The other thing worth knowing as a customer: <b>your provider's core has no idea your addresses exist.</b> That is a genuine isolation property, not marketing. But it is isolation, not encryption — traffic crosses the provider in the clear, which is why regulated traffic gets IPsec over the top regardless.
</div>

---

## What goes wrong

**Routes in `show bgp vpnv4` but not in the VRF.** RT import mismatch — or `send-community extended` missing.

**Traffic disappears mid-core.** A missing `mpls ip` on one interface.

**LDP sessions flap on unrelated link failures.** LDP router-id not pinned to a loopback.

**Interface loses its IP address.** `vrf forwarding` applied after addressing. Reapply the address.

**Only one label visible on the last core link.** PHP. Correct, not a fault.

**QoS stops at the provider edge.** DSCP-to-EXP mapping not configured or not honoured.

**CE cannot reach anything after an RD change.** Changing an RD drops and relearns the whole VRF.

---

<div class="lab">
<div class="lab-head">Lab — build a two-site L3VPN, then break it the two ways it always breaks</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a small provider network — two PEs, two P routers, two CEs — and get a customer's routes across it. Then deliberately produce the two failures that account for most real L3VPN problems: an RT mismatch and a missing <code>mpls ip</code>. Finish by proving the core genuinely has no customer routes, and by giving two customers the same address space.</div>

**Topology.** CE-A — PE-1 — P1 — P2 — PE-2 — CE-B. Loopbacks on every provider router, an IGP (OSPF) in the core, LDP on all core links. CML, EVE-NG or GNS3 all handle this comfortably.

<p class="lab-step"><span class="n">1</span>Core first — IGP, then LDP</p>

Get OSPF full across the core and every loopback reachable. Then enable `mpls ip` on each core interface.

```cisco
P1# show mpls ldp neighbor | include Peer|State
P1# show mpls forwarding-table
```

<div class="lab-watch"><b>Things to notice</b>
LDP neighbours only form where <b>both</b> ends have <code>mpls ip</code>. In the forwarding table, find entries showing <b>Pop Label</b> — those are the PHP entries for directly-connected loopbacks, and you now have a label switched path across the core before any customer exists.
<br><br>Note that <b>every entry is a /32 loopback</b>. LDP by default only labels IGP prefixes, and the loopbacks are what the VPN needs.</div>

<p class="lab-step"><span class="n">2</span>VRFs, MP-BGP, and the customer</p>

Create `CUST-A` on both PEs with matching RTs, put the CE-facing interfaces into it, and bring up the VPNv4 session between PE loopbacks.

```cisco
PE-1# show bgp vpnv4 unicast all summary
PE-1# show ip route vrf CUST-A
```

<div class="lab-watch"><b>Things to notice</b>
CE-A should reach CE-B. Trace between them and count the hops: <b>the P routers may not appear at all</b>, depending on TTL propagation. Turn it off with <code>no mpls ip propagate-ttl</code> and trace again — the core vanishes entirely, which is how providers hide their topology.
<br><br>Then run <code>show ip route</code> (the <b>global</b> table) on P1 and search for the customer's prefixes. <b>They are not there and never will be.</b> That is the design, confirmed on your own equipment.</div>

<p class="lab-step"><span class="n">3</span>Break the RT, and watch nothing be reported</p>

Change the import RT on PE-1 to a value nothing exports.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Routes stay in the VRF</b> — clear the session with <code>clear ip bgp * soft in</code>.</li>
<li><b>Everything breaks including the BGP session</b> — you changed the RD rather than the RT.</li>
<li><b>No obvious difference</b> — check <code>show ip route vrf</code>, not reachability alone.</li>
</ul>
<code>show bgp vpnv4 all</code> still shows the route, with its RT plainly visible. <code>show ip route vrf</code> does not have it. <b>No log message, no error, no state change anywhere.</b> Memorise this shape — it is most of L3VPN troubleshooting.
<br><br>Then remove <code>send-community extended</code> instead and observe the <i>same</i> symptom arrived at differently: the RT never left PE-2, so there was nothing to match.</div>

<p class="lab-step"><span class="n">4</span>Remove one `mpls ip`</p>

Take `mpls ip` off a single interface between P1 and P2.

<div class="lab-watch"><b>Things to notice</b>
LDP drops on that link. Customer traffic <b>stops</b>, and the IGP is still perfectly converged — <code>show ip route</code> on every router looks healthy.
<br><br>Trace the path with <code>show mpls forwarding-table</code> on each hop and find where the label chain breaks. <b>The routing protocol cannot see this failure at all</b>, which is why the forwarding table, not the routing table, is where you look for MPLS faults.</div>

<p class="lab-step"><span class="n">5</span>Two customers, the same addresses</p>

Add `CUST-B` on both PEs with RD `65000:200`, RTs `65000:200`, and configure **the same 10.2.20.0/24** behind CE-B's equivalent.

<div class="lab-watch"><b>Things to notice</b>
<code>show bgp vpnv4 unicast all</code> now holds <b>two entries for the same prefix</b>, distinguished only by RD. Each VRF has exactly one of them.
<br><br>Confirm the two customers cannot reach each other despite sharing addresses. <b>This is the product being sold, demonstrated in a lab</b> — and it is also the clearest possible illustration of what the RD is for.</div>

<p class="lab-step"><span class="n">6</span>Shared services with route targets</p>

Create a `SHARED` VRF exporting `65000:999`. Import `65000:999` into both customer VRFs, and export each customer's RT into `SHARED`.

<div class="lab-watch"><b>Things to notice</b>
Both customers reach the shared service. <b>They still cannot reach each other</b>, because neither imports the other's RT.
<br><br><b>That is route targets doing policy</b>, and it is the thing that becomes impossible to reason about if you believe RD and RT are the same mechanism. Draw the import/export pairs on paper first — every extranet design is this diagram.</div>

<div class="lab-earned"><b>What you earned</b>
You have built a label switched path and watched packets cross a core that has no knowledge of the addresses inside them. You can read <code>show mpls forwarding-table</code> and identify PHP from a <code>Pop Label</code> entry. You have produced the RT mismatch where the route is visibly in BGP and absent from the VRF with nothing logged, and the missing <code>mpls ip</code> that kills forwarding while routing stays perfect. You have run two customers on identical address space. And you have built an extranet with route targets, which is the point at which RD and RT stop being interchangeable in your head.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What do the two labels in an L3VPN packet mean?</p>
<label class="qz-opt"><input type="radio" name="mq1"><span>Outer = transport to the egress PE (LDP); inner = which VRF at the far end (MP-BGP)</span><em class="qz-fb qz-good">Correct — where it goes, and whose it is. Two different questions, two labels.</em></label>
<label class="qz-opt"><input type="radio" name="mq1"><span>Outer = customer, inner = QoS</span><em class="qz-fb qz-bad">QoS lives in the EXP bits of each label, not in a label of its own.</em></label>
<label class="qz-opt"><input type="radio" name="mq1"><span>Both carry the same value for redundancy</span><em class="qz-fb qz-bad">They are allocated by different protocols for different purposes.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>What is the difference between an RD and an RT?</p>
<label class="qz-opt"><input type="radio" name="mq2"><span>The RD makes a prefix unique; the RT controls which VRFs import it</span><em class="qz-fb qz-good">Correct. The RD is disambiguation, the RT is policy — and conflating them is what makes extranet designs confusing.</em></label>
<label class="qz-opt"><input type="radio" name="mq2"><span>They are the same thing with different names</span><em class="qz-fb qz-bad">They are commonly set to the same value, which is why this belief survives.</em></label>
<label class="qz-opt"><input type="radio" name="mq2"><span>The RD controls import, the RT makes prefixes unique</span><em class="qz-fb qz-bad">Exactly backwards.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>A route appears in <code>show bgp vpnv4 all</code> but not in <code>show ip route vrf</code>. Cause?</p>
<label class="qz-opt"><input type="radio" name="mq3"><span>RT import mismatch, or <code>send-community extended</code> missing</span><em class="qz-fb qz-good">Correct — and nothing anywhere logs an error, which is what makes it slow to find.</em></label>
<label class="qz-opt"><input type="radio" name="mq3"><span>The RD is wrong</span><em class="qz-fb qz-bad">A wrong RD gives a different prefix entirely, not a filtered one.</em></label>
<label class="qz-opt"><input type="radio" name="mq3"><span>LDP is down</span><em class="qz-fb qz-bad">LDP affects forwarding, not whether a route is imported.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>What does a P router hold?</p>
<label class="qz-opt"><input type="radio" name="mq4"><span>An IGP table and a label table — no VRFs and no customer routes</span><em class="qz-fb qz-good">Correct, and that is exactly why a provider core scales to thousands of customers.</em></label>
<label class="qz-opt"><input type="radio" name="mq4"><span>A VRF for every customer</span><em class="qz-fb qz-bad">That is the PE. The P router never sees a VRF.</em></label>
<label class="qz-opt"><input type="radio" name="mq4"><span>A full BGP table</span><em class="qz-fb qz-bad">It runs no BGP at all in a standard design.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>What does <code>Pop Label</code> in the forwarding table mean?</p>
<label class="qz-opt"><input type="radio" name="mq5"><span>The downstream router advertised implicit-null — penultimate hop popping</span><em class="qz-fb qz-good">Correct. The transport label is removed one hop early to save the egress PE a lookup.</em></label>
<label class="qz-opt"><input type="radio" name="mq5"><span>The label is invalid and the packet is dropped</span><em class="qz-fb qz-bad">It is a normal, expected operation.</em></label>
<label class="qz-opt"><input type="radio" name="mq5"><span>The route has no label because LDP is down</span><em class="qz-fb qz-bad">That shows as <code>No Label</code>, which is a different thing.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Customer traffic stops but every routing table looks healthy. What do you check?</p>
<label class="qz-opt"><input type="radio" name="mq6"><span>The label path — a missing <code>mpls ip</code> on one core interface</span><em class="qz-fb qz-good">Correct. The IGP is unaffected, so the routing table tells you nothing. Follow <code>show mpls forwarding-table</code> hop by hop.</em></label>
<label class="qz-opt"><input type="radio" name="mq6"><span>The RT configuration</span><em class="qz-fb qz-bad">Worth checking, but an RT fault removes the route from the VRF — the tables would not look healthy.</em></label>
<label class="qz-opt"><input type="radio" name="mq6"><span>The CE's default route</span><em class="qz-fb qz-bad">The CE is unchanged, and its tables are among the healthy ones.</em></label>
</div>

---

## References

- **RFC 3031** — *Multiprotocol Label Switching Architecture*. LSR, LSP and the forwarding model.
- **RFC 3032** — *MPLS Label Stack Encoding*. The 32-bit label, including the S bit.
- **RFC 4364** — *BGP/MPLS IP Virtual Private Networks (VPNs)*. RD, RT and VPNv4.
- **RFC 5036** — *LDP Specification*.
- Cisco — [MPLS Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/mp_basic/configuration/xe-17/mp-basic-xe-17-book.html)

---

*Related: [VRF-Lite and GRE tunnels](/blog/vrf-lite-and-gre-tunnels-explained) · [BGP best path selection](/blog/bgp-best-path-selection-the-tie-breakers-in-order) · [QoS: classification and PHB](/blog/qos-classification-marking-queuing-and-phb).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
