---
title: "Controllers, Overlays and Fabrics: What SD-Access and SD-WAN Actually Change"
excerpt: "Every router still runs a control plane and a data plane. Software-defined networking moves the control plane somewhere central, so policy is expressed once instead of translated into a thousand device configurations. The overlay is how that policy survives a network that knows nothing about it."
date: "2026-09-21"
tags: ["SDN", "SD-Access", "SD-WAN", "VXLAN", "LISP", "Overlay", "Automation", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 6.2 *Compare traditional networks with controller-based networking*, 6.3 *Describe controller-based, software defined architecture (overlay, underlay, and fabric)*. ENCOR 350-401 — 1.2 *Explain the working principles of the Cisco Catalyst SD-WAN solution*, 1.3 *Explain the working principles of the Cisco SD-Access solution*.

## Cheat sheet

| Plane | Does | Traditional | Controller-based |
|---|---|---|---|
| **Data** | Forwards packets | On the device | **Still on the device** |
| **Control** | Decides where packets go | On each device | **Centralised** |
| **Management** | Configuration and monitoring | Per device, CLI | Controller, API |

| Term | Is |
|---|---|
| **Underlay** | The physical network. Its only job is **reach every device's loopback** |
| **Overlay** | Tunnels carrying user traffic on top |
| **Fabric** | Underlay + overlay + a controller managing both |
| **VNI** | Virtual Network Identifier — 24 bits, so **16 million** segments |
| **VTEP** | Where a tunnel starts and ends |

| SD-Access | Role |
|---|---|
| **Catalyst Center** | The controller — policy, automation, assurance |
| **Control plane node** | **LISP** map server. Knows where every endpoint is |
| **Border node** | Fabric ↔ outside world |
| **Edge node** | Where users plug in. The VTEP |
| **Data plane** | **VXLAN**, carrying the **SGT** in the header |
| **Policy** | **TrustSec SGTs** — group-based, not address-based |

| SD-WAN | Role |
|---|---|
| **vManage** | Management — the GUI and API |
| **vSmart** | **Control plane.** Distributes routes and policy via **OMP** |
| **vBond** | Orchestrator — introduces devices, helps with NAT traversal |
| **vEdge / cEdge** | The routers at the sites |
| **Data plane** | **IPsec** tunnels directly between edges |

**The sentence that matters.** vSmart and the SD-Access control node **never carry user traffic**. They distribute reachability and policy; packets go directly between edges. Get this wrong and you will imagine a controller outage stops all forwarding — it does not. **Existing traffic keeps flowing; what stops is learning about change.**

---

## Controller-based architecture, one by one

Software-defined networking is one idea — move the decision-making off each box and into a controller — expressed in a shared vocabulary. These are the blueprint terms.

### Separation of control plane and data plane

Every device has a **data plane** (forwards packets, in hardware) and a **control plane** (decides *how* to forward — builds the tables). Traditionally both live on every box. SDN **separates** them: the control plane moves to a **controller**, and the devices become mostly data plane, told what to do.

- **Beginner:** the "thinking" moves to a central controller; the switches just forward.
- **Working knowledge:** the data plane stays **on the device** — this is why a controller outage does not stop existing traffic; it stops the network *learning about change*.
- **Pro:** the degree of separation varies — pure OpenFlow moves the whole control plane out; Cisco's fabrics keep a distributed control plane (IS-IS underlay, BGP/LISP) and use the controller for **policy and automation**. Knowing which model you have tells you what actually breaks when the controller is unreachable.

### Northbound and Southbound APIs

A controller talks **two directions**. **Southbound** APIs go *down* to the devices to program them (NETCONF, RESTCONF, OpenFlow, CLI). **Northbound** APIs face *up* to applications, orchestrators and humans (usually a REST API), so software can express intent to the controller.

- **Beginner:** southbound = controller-to-devices; northbound = apps-to-controller.
- **Working knowledge:** northbound is where **automation** plugs in — your script or ITSM system calls the controller's REST API, and the controller renders that into southbound device config. See [REST APIs](/blog/netconf-restconf-yang-and-rest-apis) and [JSON](/blog/json-yaml-and-python-for-network-engineers).
- **Pro:** the value of the split is that the northbound intent ("segment A cannot talk to segment B") is stable while the southbound rendering (hundreds of device configs) is generated and consistent — which is exactly what removes configuration drift.

---

## SD-WAN elements

### SD-WAN control and data planes elements

Cisco Catalyst **SD-WAN** separates four roles: **vManage** (management GUI/API), **vSmart** (control plane — distributes routes and policy over **OMP**), **vBond** (orchestrator — introduces devices and helps with NAT traversal), and **cEdge/vEdge** routers (data plane — build **IPsec** tunnels directly between sites).

- **Beginner:** a manager, a brain, an introducer, and the routers that actually carry traffic.
- **Working knowledge:** **vSmart never carries user traffic** — it is a route reflector with policy. Lose it and existing tunnels keep forwarding; you lose the ability to learn new routes and push new policy.
- **Pro:** the data plane is direct site-to-site IPsec chosen per-application by measured loss/latency/jitter — [IP SLA and PBR](/blog/ip-sla-probes-jitter-and-tracking-objects) done centrally and automatically, which is the real advance over DMVPN.

### Benefits and limitations of Catalyst SD-WAN solution

**Benefits:** transport independence (use any mix of MPLS, broadband, LTE), **application-aware** path selection, centralised policy and zero-touch provisioning, and integrated encryption and segmentation.

**Limitations:** it adds controller components you must run and secure; it is a **licensed, opinionated** system with a learning curve; and it depends on the controllers' availability for change (though not for forwarding).

- **Beginner:** great for many branches over cheap internet; it is a whole platform, not a feature.
- **Pro:** SD-WAN pays off at **branch scale and high rates of change**; for a handful of static sites, DMVPN or plain IPsec is simpler and cheaper. Match the tool to the churn, not the brochure.

---

## SD-Access elements

### SD-Access control and data planes elements

Cisco **SD-Access** is the campus fabric. **Control plane: LISP** — a map server holds "which edge is each endpoint behind," and edges **query** it instead of flooding. **Data plane: VXLAN** — frames are tunnelled edge-to-edge, carrying the **VNI** (segment) and an **SGT** (group) in the header. **Policy: TrustSec SGTs** — enforced by group, not by IP. **Catalyst Center** is the controller above it all.

- **Beginner:** LISP finds endpoints, VXLAN carries their traffic, SGTs decide who may talk to whom.
- **Working knowledge:** a user keeps their address, segment and policy as they roam, because the map server is simply updated — no VLAN follows them.
- **Pro:** most fabric faults are the boring underlay — **MTU** (VXLAN adds ~50 bytes; jumbo frames end-to-end) or an unstable IGP — not the controller. See [controllers, overlays and fabrics](#what-actually-moved).

### Traditional campus interoperating with SD-Access

A fabric rarely arrives all at once. **SD-Access interoperates** with the traditional network through the **border node**, which connects the fabric to everything outside it — legacy VLANs, the data centre, the WAN, the internet — translating between fabric (VXLAN/SGT) and non-fabric.

- **Beginner:** the border is the door between the new fabric and the existing network.
- **Working knowledge:** SGT policy can be carried beyond the fabric via **inline SGT** or **SXP**, so group-based policy survives the boundary rather than reverting to address-based rules.
- **Pro:** migrations run fabric and traditional side by side for a long time; the border (and how SGTs are preserved or dropped across it) is where the design succeeds or fails. Plan the policy translation, not just the reachability.

---

## What actually moved

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="In traditional networking every device has its own control plane while SDN centralises it">
  <style>.sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv1 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}.sv1 .n{fill:#17171A}.sv1 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:9px;font-weight:700}.sv1 .cp{fill:rgba(211,0,45,.20);stroke:#D3002D}.sv1 .ctl{fill:#B80027}
  </style>
  <text class="hdr" x="14" y="18">TRADITIONAL — control plane on every box</text>
  <rect class="n" x="14" y="28" width="86" height="40" rx="3"/><rect class="cp" x="20" y="32" width="74" height="14"/>
  <text class="nt" x="57" y="62" text-anchor="middle">R1</text>
  <rect class="n" x="114" y="28" width="86" height="40" rx="3"/><rect class="cp" x="120" y="32" width="74" height="14"/>
  <text class="nt" x="157" y="62" text-anchor="middle">R2</text>
  <rect class="n" x="214" y="28" width="86" height="40" rx="3"/><rect class="cp" x="220" y="32" width="74" height="14"/>
  <text class="nt" x="257" y="62" text-anchor="middle">R3</text>
  <rect class="n" x="314" y="28" width="86" height="40" rx="3"/><rect class="cp" x="320" y="32" width="74" height="14"/>
  <text class="nt" x="357" y="62" text-anchor="middle">R4</text>
  <text class="s" x="420" y="52">policy = the same intent,</text>
  <text class="s" x="420" y="66">translated 4 times, by hand</text>
  <text class="hdr" x="14" y="106">CONTROLLER-BASED — control plane centralised</text>
  <rect class="ctl" x="230" y="116" width="180" height="32" rx="3"/><text class="nt" x="320" y="136" text-anchor="middle">CONTROLLER</text>
  <rect class="n" x="14" y="176" width="86" height="34" rx="3"/><text class="nt" x="57" y="197" text-anchor="middle">R1</text>
  <rect class="n" x="114" y="176" width="86" height="34" rx="3"/><text class="nt" x="157" y="197" text-anchor="middle">R2</text>
  <rect class="n" x="214" y="176" width="86" height="34" rx="3"/><text class="nt" x="257" y="197" text-anchor="middle">R3</text>
  <rect class="n" x="314" y="176" width="86" height="34" rx="3"/><text class="nt" x="357" y="197" text-anchor="middle">R4</text>
  <line x1="280" y1="148" x2="57" y2="176" stroke="#D3002D" stroke-width="1.2" stroke-dasharray="3 3"/>
  <line x1="300" y1="148" x2="157" y2="176" stroke="#D3002D" stroke-width="1.2" stroke-dasharray="3 3"/>
  <line x1="330" y1="148" x2="257" y2="176" stroke="#D3002D" stroke-width="1.2" stroke-dasharray="3 3"/>
  <line x1="350" y1="148" x2="357" y2="176" stroke="#D3002D" stroke-width="1.2" stroke-dasharray="3 3"/>
  <text class="s" x="420" y="192">policy = expressed once</text>
  <rect x="14" y="226" width="612" height="46" fill="rgba(75,123,236,.08)" stroke="#4b7bec"/>
  <text class="k" x="26" y="246" fill="#2f5fd0">The data plane did not move. Every device still forwards its own packets.</text>
  <text class="s" x="26" y="264">Which is why a controller outage does not stop traffic — it stops the network learning about change.</text>
</svg>
<figcaption><b>Figure 1.</b> The gain is not speed. It is that intent stops being retyped per device — which is where configuration drift came from.</figcaption>
</figure>

<div class="why">
<b>The honest version of the value proposition</b>
Controller-based networking does not make packets faster, and it adds components that can fail. What it buys is <b>consistency and speed of change</b>: one policy applied to 400 sites, with the controller responsible for translating it, and a record of what was intended rather than only what was typed.
<br><br>The cost is real. <b>You now depend on a controller cluster</b>, on its software versions, and on a skill set that is as much API as CLI. It pays back at scale and at high rates of change. At ten sites that rarely change, it usually does not — and saying so is not heresy.
</div>

---

## Overlay, underlay, fabric

<div class="walk">
<div class="walk-head">How an overlay carries policy the underlay cannot see <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="sdw" id="sd1" checked><label for="sd1"><span class="step-n">1</span>Two networks</label>
  <input type="radio" name="sdw" id="sd2"><label for="sd2"><span class="step-n">2</span>The VXLAN header</label>
  <input type="radio" name="sdw" id="sd3"><label for="sd3"><span class="step-n">3</span>SD-Access</label>
  <input type="radio" name="sdw" id="sd4"><label for="sd4"><span class="step-n">4</span>SD-WAN</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The underlay routes loopbacks while the overlay carries user traffic in tunnels between them">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv2 .n{fill:#17171A}.sv2 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:9.5px;font-weight:700}</style>
  <rect class="n" x="30" y="104" width="80" height="28" rx="3"/><text class="nt" x="70" y="122" text-anchor="middle">EDGE-1</text>
  <rect class="n" x="180" y="104" width="64" height="28" rx="3"/><text class="nt" x="212" y="122" text-anchor="middle">core</text>
  <rect class="n" x="314" y="104" width="64" height="28" rx="3"/><text class="nt" x="346" y="122" text-anchor="middle">core</text>
  <rect class="n" x="448" y="104" width="80" height="28" rx="3"/><text class="nt" x="488" y="122" text-anchor="middle">EDGE-2</text>
  <line x1="110" y1="118" x2="180" y2="118" stroke="#8A8A93" stroke-width="2"/>
  <line x1="244" y1="118" x2="314" y2="118" stroke="#8A8A93" stroke-width="2"/>
  <line x1="378" y1="118" x2="448" y2="118" stroke="#8A8A93" stroke-width="2"/>
  <text class="s" x="280" y="146" text-anchor="middle">UNDERLAY — routed, loopbacks reachable, nothing else</text>
  <path d="M 70 104 C 180 30, 380 30, 488 104" fill="none" stroke="#4b7bec" stroke-width="2.5"/>
  <circle r="4" fill="#4b7bec"><animateMotion dur="2s" repeatCount="indefinite" path="M 70 104 C 180 30, 380 30, 488 104"/></circle>
  <text class="k" x="280" y="46" text-anchor="middle" fill="#2f5fd0">OVERLAY — the tunnel user traffic rides in</text>
  <text class="k" x="14" y="180">The core devices route loopback to loopback. They never see a user address or a VLAN.</text>
</svg>
<p class="walk-say"><span class="walk-title">Two networks in one set of cables</span>
The <b>underlay</b> is an ordinary routed network — usually IS-IS or OSPF — whose only job is to make every device's loopback reachable. Keep it boring and stable; it is not where policy lives.
<br><br>The <b>overlay</b> is tunnels between those loopbacks carrying user traffic. Segmentation, policy and mobility all live here.
<br><br>The payoff is the same one MPLS gets: <b>the middle of the network holds no user state.</b> A core switch in an SD-Access fabric does not know your VLANs exist, so adding a segment changes nothing on it. That is why a fabric can add a virtual network in minutes when a traditional design needs VLANs plumbed end to end.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The VXLAN group policy option header carries a scalable group tag alongside the virtual network identifier">
  <style>.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;fill:#17171A}.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv3 .g{fill:rgba(211,0,45,.16);stroke:#D3002D}.sv3 .v{fill:rgba(75,123,236,.18);stroke:#4b7bec}</style>
  <rect class="f" x="14" y="34" width="78" height="32"/><text class="m" x="53" y="55" text-anchor="middle">88</text>
  <rect class="f" x="96" y="34" width="78" height="32"/><text class="m" x="135" y="55" text-anchor="middle">00</text>
  <rect class="g" x="178" y="34" width="130" height="32"/><text class="m" x="243" y="55" text-anchor="middle">04 4e</text>
  <rect class="v" x="312" y="34" width="180" height="32"/><text class="m" x="402" y="55" text-anchor="middle">00 1f fd</text>
  <rect class="f" x="496" y="34" width="78" height="32"/><text class="m" x="535" y="55" text-anchor="middle">00</text>
  <text class="s" x="53" y="82" text-anchor="middle">flags</text>
  <text class="s" x="243" y="82" text-anchor="middle">SGT 1102</text>
  <text class="s" x="402" y="82" text-anchor="middle">VNI 8189</text>
  <text class="k" x="14" y="122">24 bits of VNI = 16 million segments. Compare 4094 VLANs.</text>
  <text class="k" x="14" y="152" fill="#B80027">And the SGT rides in the header — policy travels WITH the packet.</text>
  <text class="s" x="14" y="176">So an access list at the far end can match &#8220;Contractors&#8221; rather than a subnet. The group is carried,</text>
  <text class="s" x="14" y="192">not inferred from an address — which is what makes policy survive when addresses change.</text>
</svg>
<p class="walk-say"><span class="walk-title">Eight bytes that replace a VLAN tag</span>
VXLAN wraps the original Ethernet frame in UDP (port 4789) with an 8-byte header. The <b>VNI</b> is 24 bits — sixteen million segments against 802.1Q's 4094, which is the segmentation ceiling gone.
<br><br>Cisco's variant, <b>VXLAN-GPO</b>, uses two otherwise-reserved bytes to carry a <b>Scalable Group Tag</b>. That is the piece that changes how policy is written: the packet declares which group it belongs to, so a rule can say "Contractors may not reach Finance" <b>without referencing a single IP address</b>.
<br><br>The cost is overhead — about <b>50 bytes</b> with the outer headers — which is why fabric underlays run jumbo frames. Miss that and you get the familiar fault where pings work and transfers hang.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SD-Access uses LISP for control VXLAN for data and scalable group tags for policy">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv4 .f{fill:#F1EEE9;stroke:#B5B5BC}.sv4 .hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <rect class="f" x="14" y="30" width="196" height="72"/>
  <text class="hdr" x="26" y="50">CONTROL — LISP</text>
  <text class="s" x="26" y="70">Map server knows which</text>
  <text class="s" x="26" y="88">edge every endpoint is behind</text>
  <rect class="f" x="222" y="30" width="196" height="72"/>
  <text class="hdr" x="234" y="50">DATA — VXLAN</text>
  <text class="s" x="234" y="70">Frames tunnelled edge</text>
  <text class="s" x="234" y="88">to edge, VNI + SGT inside</text>
  <rect class="f" x="430" y="30" width="196" height="72"/>
  <text class="hdr" x="442" y="50">POLICY — TrustSec</text>
  <text class="s" x="442" y="70">SGT matrix, enforced</text>
  <text class="s" x="442" y="88">at the destination edge</text>
  <rect x="14" y="118" width="612" height="44" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="k" x="26" y="138" fill="#0f6b47">Ask, do not flood. An edge queries the map server instead of broadcasting.</text>
  <text class="s" x="26" y="154">Which is why a fabric can be one big segment without the broadcast behaviour of one big VLAN.</text>
  <rect x="14" y="172" width="612" height="34" fill="rgba(75,123,236,.08)" stroke="#4b7bec"/>
  <text class="s" x="26" y="193">A device moves floors and keeps its address and its policy — the map server is simply updated.</text>
</svg>
<p class="walk-say"><span class="walk-title">SD-Access — the campus fabric</span>
Three protocols, three jobs. <b>LISP</b> is the control plane: a map server holds "endpoint X is behind edge Y", and edges <b>query</b> it rather than flooding. <b>VXLAN</b> is the data plane. <b>TrustSec SGTs</b> are the policy.
<br><br>The consequence that sells it: <b>a user can move anywhere and keep their address, their segment and their policy.</b> No VLAN follows them; the map server is updated and the next lookup returns a different edge.
<br><br>And because reachability is a lookup rather than a flood, a fabric can span a campus without the broadcast domain behaving like one enormous VLAN. <b>Catalyst Center</b> sits above all of it — provisioning the underlay, rendering the SGT matrix into device policy, and running assurance.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 215" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SD-WAN separates orchestration management control and data planes across four components">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv5 .n{fill:#17171A}.sv5 .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:9.5px;font-weight:700}.sv5 .c{fill:#B80027}</style>
  <rect class="c" x="30" y="26" width="110" height="26" rx="3"/><text class="nt" x="85" y="44" text-anchor="middle">vBond</text>
  <rect class="c" x="160" y="26" width="110" height="26" rx="3"/><text class="nt" x="215" y="44" text-anchor="middle">vManage</text>
  <rect class="c" x="290" y="26" width="110" height="26" rx="3"/><text class="nt" x="345" y="44" text-anchor="middle">vSmart</text>
  <text class="s" x="85" y="68" text-anchor="middle">introduces</text>
  <text class="s" x="215" y="68" text-anchor="middle">manages</text>
  <text class="s" x="345" y="68" text-anchor="middle">OMP routes + policy</text>
  <rect class="n" x="60" y="128" width="100" height="28" rx="3"/><text class="nt" x="110" y="146" text-anchor="middle">cEdge site A</text>
  <rect class="n" x="440" y="128" width="100" height="28" rx="3"/><text class="nt" x="490" y="146" text-anchor="middle">cEdge site B</text>
  <line x1="110" y1="128" x2="330" y2="52" stroke="#D3002D" stroke-width="1.2" stroke-dasharray="3 3"/>
  <line x1="490" y1="128" x2="370" y2="52" stroke="#D3002D" stroke-width="1.2" stroke-dasharray="3 3"/>
  <path d="M 160 142 L 440 142" fill="none" stroke="#1f9d6b" stroke-width="2.5"/>
  <circle r="4" fill="#1f9d6b"><animateMotion dur="1.8s" repeatCount="indefinite" path="M 160 142 L 440 142"/></circle>
  <text class="m" x="300" y="164" text-anchor="middle" fill="#0f6b47">IPsec — user traffic goes DIRECTLY, never via vSmart</text>
  <rect x="14" y="178" width="612" height="32" fill="rgba(75,123,236,.08)" stroke="#4b7bec"/>
  <text class="s" x="26" y="199">Lose vSmart and existing tunnels keep forwarding. What stops is learning about change.</text>
</svg>
<p class="walk-say"><span class="walk-title">SD-WAN — the branch fabric</span>
Four components, cleanly separated. <b>vBond</b> introduces devices to each other and helps them through NAT. <b>vManage</b> is management and API. <b>vSmart</b> is the control plane, distributing routes and policy over <b>OMP</b>. <b>cEdge/vEdge</b> routers sit at the sites and build <b>IPsec tunnels directly to each other</b>.
<br><br>The part worth internalising: <b>vSmart never carries user traffic.</b> It is a route reflector with policy attached. Lose it and existing tunnels keep forwarding — you lose the ability to learn new routes and push new policy, which is serious but is not an outage.
<br><br>What SD-WAN adds over DMVPN is <b>application-aware path selection</b>: measure loss, latency and jitter per transport continuously, and move an application to the better path automatically. That is IP SLA and PBR, done centrally and without a human.</p>
</div>
</div>
</div>

---

## The VXLAN header, in bytes

<div class="cap">
<div class="cap-head">Capture · VXLAN-GPO, SD-Access data plane <span class="cap-filter">udp.port == 4789</span></div>
<div class="cap-hex"><pre>outer IP  ...  outer UDP  src 49152  <mark>dst 4789</mark>
VXLAN header (8 bytes)
0000  <mark>88</mark> 00 <mark>04 4e</mark> <mark>00 1f fd</mark> 00                              ..N.....
      then the ORIGINAL Ethernet frame, complete with its own MACs</pre></div>
<div class="cap-note">
<b>88</b> — flags. The <b>I</b> bit says the VNI is valid; the <b>G</b> bit says a group policy ID is present, which is what distinguishes Cisco's VXLAN-GPO from plain VXLAN.<br>
<b>04 4e</b> — group policy ID <b>1102</b>. That is the <b>SGT</b>, travelling inside the packet. Policy at the far end can match on it without knowing or caring what IP address the endpoint has.<br>
<b>00 1f fd</b> — VNI <b>8189</b>, the virtual network. Twenty-four bits, so 16,777,216 possible segments.<br>
And then the <b>entire original Ethernet frame</b>, MAC addresses and all. That is why VXLAN can carry a Layer 2 segment across a routed underlay — and why the overhead is roughly <b>50 bytes</b>, which is the whole reason fabric underlays run jumbo frames.
</div>
</div>

---

## Traditional against controller-based

| | Traditional | Controller-based |
|---|---|---|
| **Configuration** | Per device, CLI | Intent at the controller, rendered down |
| **Policy** | ACLs keyed to **IP addresses** | Groups (SGTs) — **address-independent** |
| **New segment** | VLANs plumbed end to end | A VNI; core devices unchanged |
| **Troubleshooting** | Log in to each device | Assurance, with the CLI still underneath |
| **Fails when** | Someone mistypes on one box | The controller cluster has a problem |
| **Skills** | CLI | CLI **plus** API, and the controller's model |
| **Scales with** | Headcount | Sites |

<div class="why">
<b>Group-based policy is the part that actually changes your job</b>
A traditional ACL says <code>permit 10.1.20.0/24 to 10.4.0.0/16</code> — and it is only correct while those subnets mean what you assumed. Renumber, and the policy silently becomes wrong.
<br><br>An SGT policy says <b>Contractors may not reach Finance</b>. The tag travels in the packet header, so the rule holds wherever the endpoint is and whatever address it has. <b>Policy stops being a function of topology.</b>
<br><br>That is genuinely a different way of thinking, and it is the part of SDN worth learning even if you never deploy a fabric — because the same idea is now everywhere, from cloud security groups to service meshes.
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>Fabric edge — the fabric is still a router underneath</div>
<pre><span class="p">EDGE-1#</span> <span class="c">show lisp instance-id 8189 ipv4 database</span>
LISP ETR IPv4 Mapping Database for EID-table vrf CORP (IID 8189)
Entries total 2

10.1.20.50/32, dynamic-eid CORP-IP, <span class="g">inherited from default locator-set rloc</span>
  Locator      Pri/Wgt  Source     State
  10.255.0.11    10/10  cfg-intf   <span class="g">site-self, reachable</span>

<span class="p">EDGE-1#</span> <span class="c">show lisp instance-id 8189 ipv4 map-cache 10.4.30.99</span>
10.4.30.0/24, uptime: 00:12:04, expires: 23:47:55, via <span class="y">map-reply, complete</span>
  Locator      Uptime    State   Pri/Wgt
  <span class="g">10.255.0.22</span>  00:12:04  up       10/10

<span class="o">! "via map-reply" = the control plane node answered a query. That is the</span>
<span class="o">! ask-do-not-flood model, visible. A negative map-reply means the endpoint</span>
<span class="o">! is not in the fabric — traffic goes to the border instead.</span>

<span class="p">EDGE-1#</span> <span class="c">show cts role-based permissions</span>
IPv4 Role-based permissions from group 1102:Contractors
   to group 1200:Finance:
        <span class="r">Deny IP-00</span>

<span class="o">! Policy expressed as groups. No IP address appears anywhere in it.</span>

<span class="p">vManage#</span> <span class="c">show omp routes | include 10.4.30</span>
                                     PATH  ATTRIBUTE
TENANT  VPN  PREFIX        FROM PEER  ID   TYPE       STATUS
-----------------------------------------------------------
0       10   10.4.30.0/24  10.255.1.1  68  installed  <span class="g">C,I,R</span>

<span class="o">! C,I,R = Chosen, Installed, Received. Anything less and the route was</span>
<span class="o">! received but rejected — usually by a vSmart control policy, deliberately.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>None of this replaces knowing how routing works.</b> A fabric edge is a router running LISP and VXLAN; an SD-WAN edge is a router running OMP and IPsec. When the controller says something is wrong, you still diagnose it with the same reasoning — the controller just told you where to look faster.</p>

<div class="real">
<b>In the real world</b>
The commonest disappointment with fabrics is <b>expecting the controller to remove the need to understand the network.</b> It does not. When an SD-Access fabric misbehaves you are debugging LISP map-caches and VXLAN encapsulation, and the people who cope are the ones who already understood routing and segmentation.
<br><br>The commonest <b>win</b> is equally consistent: onboarding a site or a segment goes from a change window to a form. That is where the money is, and it is why the technology keeps spreading despite the added complexity.
<br><br>Also worth saying plainly: <b>the underlay must be boring.</b> Most fabric problems people blame on the controller are jumbo frames not configured end to end, or an IGP that was never stable to begin with.
</div>

---

## What goes wrong

**Pings work, transfers fail in a fabric.** Underlay MTU — VXLAN adds ~50 bytes. Jumbo frames end to end.

**Endpoints unreachable, underlay fine.** LISP map-cache. Check the control plane node.

**Policy not enforced.** SGT not being carried, or the matrix not pushed to the edge.

**SD-WAN site isolated after a change.** A vSmart control policy filtered the routes deliberately. Check OMP status flags.

**Controller down, panic.** Data plane keeps forwarding. You have lost change, not traffic.

**Fabric works, wireless does not.** APs need their own onboarding in the fabric — a separate step.

---

<div class="lab">
<div class="lab-head">Lab — build an overlay by hand, so the controller stops being magic</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
You probably cannot lab Catalyst Center. You can absolutely lab the mechanisms underneath it. Build a VXLAN overlay manually over a routed underlay, watch the encapsulation in a capture, break it with MTU, and prove the core never learns a user address. Then use a DevNet sandbox to see the controller view of the same ideas.</div>

**Topology.** Four routers or switches supporting VXLAN (CSR1000v, Nexus 9000v, or Linux with `ip link add type vxlan`). Two "edges", two "core", loopbacks everywhere, OSPF in the underlay.

<p class="lab-step"><span class="n">1</span>Underlay only, and keep it boring</p>

OSPF across the core. Every loopback reachable. **No user VLANs anywhere.**

<div class="lab-watch"><b>Things to notice</b>
Confirm the core devices' routing tables contain <b>only</b> infrastructure links and loopbacks. Write down how many routes that is.
<br><br>At the end of this lab, check it again — <b>the number will not have changed</b>, no matter how many overlay segments you add. That invariance is the whole architectural argument, and seeing it yourself beats reading it.</div>

<p class="lab-step"><span class="n">2</span>Build the overlay by hand</p>

```bash
# Linux, on each edge
ip link add vxlan8189 type vxlan id 8189 local <loopback> remote <peer-loopback> dstport 4789
ip link set vxlan8189 up
ip link add br0 type bridge && ip link set vxlan8189 master br0
```

<div class="lab-watch"><b>Things to notice</b>
Two hosts on different edges are now on the <b>same Layer 2 segment</b>, across a routed core that has no idea either exists. Check ARP between them — it works, and the ARP request crossed a router.
<br><br>Then look at the core's routing table again: <b>unchanged</b>. You added a broadcast domain spanning the network and no core device knows.</div>

<p class="lab-step"><span class="n">3</span>Capture the encapsulation</p>

```bash
tcpdump -i <core-link> -w vxlan.pcap udp port 4789
```

<div class="lab-watch"><b>Things to notice</b>
Wireshark decodes it as VXLAN. Expand one packet and find <b>a complete Ethernet frame inside a UDP datagram</b> — outer MACs, outer IP, outer UDP, VXLAN header, then inner MACs and the original payload.
<br><br>Find the <b>VNI</b> and confirm it reads 8189. Then measure total frame size against the inner payload: <b>about 50 bytes of overhead</b>, exactly as advertised. Build a second VNI and watch both share one tunnel, separated only by that 24-bit field.</div>

<p class="lab-step"><span class="n">4</span>Break it with MTU, the way it breaks in production</p>

Set the core links to a standard 1500-byte MTU and send full-size frames through the overlay.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It still works</b> — something is fragmenting. Set DF on the inner packet.</li>
<li><b>Nothing works at all</b> — your MTU is below the outer headers; raise it slightly.</li>
<li><b>Only large transfers fail</b> — correct, and that is the point.</li>
</ul>
<b>Small packets fine, large packets gone.</b> Set the underlay to 9216 and it all works. <b>This one fault accounts for a large share of real fabric problems</b>, and it is invariably blamed on the controller.</div>

<p class="lab-step"><span class="n">5</span>See the controller view</p>

Use a [Cisco DevNet sandbox](https://developer.cisco.com/site/sandbox/) for Catalyst Center or SD-WAN, and query it with the API rather than clicking.

```bash
curl -k -u <user>:<pass> -X POST https://<dnac>/dna/system/api/v1/auth/token
curl -k -H "X-Auth-Token: <token>" https://<dnac>/dna/intent/api/v1/network-device | jq '.response[] | {hostname, softwareVersion}'
```

<div class="lab-watch"><b>Things to notice</b>
The controller returns the device inventory as <b>JSON</b>, which is exactly the shape from <a href="/blog/json-yaml-and-python-for-network-engineers">the JSON article</a>. A controller is, from your side, an HTTP API over the network's state.
<br><br>Then find the same information by logging into one device with the CLI. <b>The controller did not invent anything</b> — it collected what the devices already knew and made it queryable in one call. That is the honest description of what it does.</div>

<p class="lab-step"><span class="n">6</span>Think in groups, not subnets</p>

On paper, take one of your real ACLs and rewrite it as an SGT matrix: what groups exist, and which may talk to which.

<div class="lab-watch"><b>Things to notice</b>
Most ACLs turn out to encode <b>two or three actual intentions</b> buried in dozens of address-based lines. Writing the matrix reveals what the policy was always trying to say.
<br><br>Then ask: if those subnets were renumbered tomorrow, which version stays correct? <b>That question is the entire case for group-based policy</b>, and you do not need a fabric to benefit from asking it.</div>

<div class="lab-earned"><b>What you earned</b>
You have built an overlay by hand, so VXLAN is a header you have read rather than a product feature. You have confirmed that adding overlay segments leaves the core's routing table untouched — the architectural claim, verified. You have produced the MTU fault that causes a large share of real fabric problems. You have queried a controller with an API and seen that it returns what the devices already knew. And you have rewritten an address-based ACL as a group matrix, which is the shift in thinking that outlasts any particular product.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>In controller-based networking, which plane moves to the controller?</p>
<label class="qz-opt"><input type="radio" name="sq1"><span>The control plane — the data plane stays on every device</span><em class="qz-fb qz-good">Correct, which is why a controller outage stops learning about change rather than stopping traffic.</em></label>
<label class="qz-opt"><input type="radio" name="sq1"><span>The data plane</span><em class="qz-fb qz-bad">Packets are still forwarded by the devices themselves.</em></label>
<label class="qz-opt"><input type="radio" name="sq1"><span>Both</span><em class="qz-fb qz-bad">Centralising forwarding would not scale, and nobody does it.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>What is the underlay's job?</p>
<label class="qz-opt"><input type="radio" name="sq2"><span>Make every device's loopback reachable — nothing more</span><em class="qz-fb qz-good">Correct. Keep it boring and stable; user state lives in the overlay.</em></label>
<label class="qz-opt"><input type="radio" name="sq2"><span>Carry user VLANs end to end</span><em class="qz-fb qz-bad">That is exactly what the overlay removes the need for.</em></label>
<label class="qz-opt"><input type="radio" name="sq2"><span>Enforce security policy</span><em class="qz-fb qz-bad">Policy travels in the overlay, in the SGT.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Which protocols does SD-Access use for control and data?</p>
<label class="qz-opt"><input type="radio" name="sq3"><span>LISP for control, VXLAN for data, SGTs for policy</span><em class="qz-fb qz-good">Correct — a map server answers queries instead of the network flooding.</em></label>
<label class="qz-opt"><input type="radio" name="sq3"><span>OMP for control, IPsec for data</span><em class="qz-fb qz-bad">That is SD-WAN.</em></label>
<label class="qz-opt"><input type="radio" name="sq3"><span>BGP for control, MPLS for data</span><em class="qz-fb qz-bad">That is an MPLS L3VPN.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>vSmart fails. What happens to user traffic?</p>
<label class="qz-opt"><input type="radio" name="sq4"><span>It keeps flowing — existing IPsec tunnels are unaffected; new routes and policy stop</span><em class="qz-fb qz-good">Correct. vSmart is a control plane; it never carried the packets.</em></label>
<label class="qz-opt"><input type="radio" name="sq4"><span>All traffic stops immediately</span><em class="qz-fb qz-bad">Only true if the controller were in the data path, which it is not.</em></label>
<label class="qz-opt"><input type="radio" name="sq4"><span>Traffic falls back to MPLS</span><em class="qz-fb qz-bad">Transport choice is unrelated to vSmart's availability.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>How many segments does a 24-bit VNI allow, and why does it matter?</p>
<label class="qz-opt"><input type="radio" name="sq5"><span>About 16 million — against 4094 VLANs, so segmentation stops being a scarce resource</span><em class="qz-fb qz-good">Correct, and it is why fabrics can give every tenant or function its own segment.</em></label>
<label class="qz-opt"><input type="radio" name="sq5"><span>4094, the same as VLANs</span><em class="qz-fb qz-bad">That is the 12-bit 802.1Q limit VXLAN was designed to escape.</em></label>
<label class="qz-opt"><input type="radio" name="sq5"><span>65536</span><em class="qz-fb qz-bad">That would be 16 bits.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Pings succeed across a fabric but large transfers fail. Most likely cause?</p>
<label class="qz-opt"><input type="radio" name="sq6"><span>Underlay MTU — VXLAN adds around 50 bytes and jumbo frames are not set end to end</span><em class="qz-fb qz-good">Correct, and it is routinely blamed on the controller.</em></label>
<label class="qz-opt"><input type="radio" name="sq6"><span>The SGT matrix is blocking traffic</span><em class="qz-fb qz-bad">Policy blocks by group, not by packet size.</em></label>
<label class="qz-opt"><input type="radio" name="sq6"><span>LISP map-cache expired</span><em class="qz-fb qz-bad">That would break all sizes equally.</em></label>
</div>

---

## References

- **RFC 7348** — *Virtual eXtensible Local Area Network (VXLAN)*. The 8-byte header.
- **RFC 6830 / RFC 9300** — *The Locator/ID Separation Protocol (LISP)*.
- Cisco — [SD-Access Solution Design Guide (CVD)](https://www.cisco.com/c/en/us/solutions/design-zone/networking-design-guides/campus-wired-wireless.html)
- Cisco — [Catalyst SD-WAN Design Guide](https://www.cisco.com/c/en/us/solutions/design-zone/networking-design-guides/sd-wan-design-guides.html)
- [Cisco DevNet sandboxes](https://developer.cisco.com/site/sandbox/) — free Catalyst Center and SD-WAN environments.

---

*Related: [MPLS and L3VPN](/blog/mpls-lsr-ldp-label-switching-and-l3vpn) · [DMVPN](/blog/dmvpn-nhrp-mgre-and-spoke-to-spoke-tunnels) · [JSON, YAML and Python](/blog/json-yaml-and-python-for-network-engineers) · [NETCONF and RESTCONF](/blog/netconf-restconf-yang-and-rest-apis).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
