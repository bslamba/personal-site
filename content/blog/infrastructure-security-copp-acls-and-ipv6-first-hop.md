---
title: "Infrastructure Security: Protecting the Router Itself — CoPP, ACLs and IPv6 First-Hop"
excerpt: "Data-plane traffic you can lose and retransmit. Control-plane traffic keeps the router alive — and it is a shared CPU anyone on the network can aim at. CoPP rate-limits what reaches that CPU, infrastructure ACLs keep strangers off the management plane, and IPv6 First-Hop Security closes the Layer-2 doors that ARP-era controls never covered for v6."
date: "2026-09-22"
tags: ["CoPP", "ACLs", "IPv6", "First Hop Security", "Control plane", "Hardening", "ENCOR", "ENARSI"]
draft: false
---

> **Blueprint:** ENCOR 350-401 — 5.2 *Configure and verify infrastructure security features (ACLs, CoPP)*. ENARSI 300-410 — 3.3 *Troubleshoot control plane policing (CoPP) (Telnet, SSH, HTTP(S), SNMP, EIGRP, OSPF, BGP)*, 3.4 *Describe IPv6 First Hop security features (RA guard, DHCP guard, binding table, ND inspection/snooping, source guard)*.

## Cheat sheet

| Plane | Carries | Protect it with |
|---|---|---|
| **Data** | User traffic passing *through* | Interface ACLs, uRPF, QoS |
| **Control** | Traffic *to* the router's CPU — routing, management | **CoPP**, management-plane ACLs |
| **Management** | Admin access — SSH, SNMP, NetFlow | `access-class`, VTY ACLs, CoPP |

| CoPP piece | Does |
|---|---|
| **class-map** | Match a category of control traffic (routing, management, ICMP…) |
| **policy-map** | `police` each class to a rate; `conform`/`exceed` actions |
| **`control-plane`** | Where the policy is applied — `service-policy input` |
| **The goal** | The CPU stays reachable **during** a flood, not after |

| IPv6 First-Hop Security | Stops |
|---|---|
| **RA Guard** | Rogue **Router Advertisements** (a host claiming to be the gateway) |
| **DHCPv6 Guard** | Rogue DHCPv6 servers |
| **Binding table** | The source of truth: IPv6 ↔ MAC ↔ port ↔ VLAN |
| **ND Inspection/Snooping** | Spoofed Neighbor Discovery (the IPv6 ARP-poisoning equivalent) |
| **Source Guard** | Traffic from an address not in the binding table |

**The sentence that frames the topic.** The router's CPU is a **shared resource every device on the network can send to** — a routing update, an SSH attempt, a ping. CoPP is the only thing standing between "a flood of control traffic" and "the router is too busy to be managed or to run its routing protocols," which is precisely when you need it reachable.

---

## Why the control plane needs its own protection

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 235" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Data plane traffic is switched in hardware while control plane traffic is punted to the CPU which can be overwhelmed">
  <style>
    .sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}
    .sv1 .hw{fill:rgba(31,157,107,.14);stroke:#1f9d6b}
    .sv1 .cpu{fill:rgba(211,0,45,.12);stroke:#D3002D}
  </style>
  <rect class="hw" x="14" y="30" width="290" height="80"/>
  <text class="k" x="26" y="52" fill="#0f6b47">DATA PLANE — hardware (ASIC)</text>
  <text class="s" x="26" y="74">forwards through-traffic at line rate</text>
  <text class="s" x="26" y="92">a flood here is absorbed by the silicon</text>
  <rect class="cpu" x="336" y="30" width="290" height="80"/>
  <text class="k" x="348" y="52" fill="#B80027">CONTROL PLANE — the CPU</text>
  <text class="s" x="348" y="74">handles traffic addressed TO the router:</text>
  <text class="m" x="348" y="92">OSPF/BGP/EIGRP · SSH · SNMP · ARP · ICMP</text>
  <path d="M 160 110 L 160 140 L 470 140 L 470 110" fill="none" stroke="#8A8A93" stroke-width="1.5"/>
  <text class="s" x="230" y="134">some packets are "punted" up to the CPU →</text>
  <rect x="14" y="156" width="612" height="34" fill="#FFF1F3" stroke="#D3002D"/>
  <text class="k" x="26" y="177" fill="#B80027">The CPU is small, shared, and reachable by anyone. A flood of punted traffic starves it.</text>
  <rect x="14" y="198" width="612" height="34" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="s" x="26" y="219" fill="#0f6b47">CoPP polices each category of control traffic so no one category can crowd out the others — or you.</text>
</svg>
<figcaption><b>Figure 1.</b> The data plane scales in hardware; the control plane is one CPU. CoPP is a QoS policy applied to that CPU's inbound traffic.</figcaption>
</figure>

<div class="why">
<b>Why a data-plane ACL is not enough</b>
An interface ACL filters traffic <b>passing through</b> the router. But control traffic is <b>addressed to the router</b> and arrives on every interface — you cannot ACL it away on one interface without also blocking legitimate routing and management, and you would have to repeat it on every interface. CoPP is applied <b>once</b>, to the control plane itself, and it <b>rate-limits rather than blocks</b>, so legitimate OSPF still flows while a flood of it is capped.
<br><br>The design mindset: CoPP is <a href="/blog/qos-classification-marking-queuing-and-phb">QoS</a> pointed inward. Same MQC — class-maps, a policy-map with <code>police</code>, a service-policy — but the "interface" is <code>control-plane</code>, and the goal is not fairness between users, it is keeping the CPU alive under attack.
</div>

---

## The three infrastructure controls

<div class="walk">
<div class="walk-head">What each one protects, and how <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="isw" id="is1" checked><label for="is1"><span class="step-n">1</span>Infrastructure ACLs</label>
  <input type="radio" name="isw" id="is2"><label for="is2"><span class="step-n">2</span>CoPP</label>
  <input type="radio" name="isw" id="is3"><label for="is3"><span class="step-n">3</span>IPv6 first-hop</label>
  <input type="radio" name="isw" id="is4"><label for="is4"><span class="step-n">4</span>Reading CoPP</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="An infrastructure ACL at the edge blocks the outside from reaching internal infrastructure addresses">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv2 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <text class="k" x="14" y="26">Infrastructure ACL — keep outsiders off the network's own addresses</text>
  <text class="s" x="14" y="50">Applied inbound at the edge: DENY the outside world from reaching your infrastructure ranges</text>
  <text class="s" x="14" y="66">(loopbacks, links, management), PERMIT everything else through to the customers/services.</text>
  <text class="m" x="14" y="94">deny ip any 10.0.0.0 0.0.0.255   (infra range)</text>
  <text class="m" x="14" y="110">permit ip any any</text>
  <text class="s" x="14" y="140">The point: nobody outside should ever be sending packets TO a backbone link address.</text>
</svg>
<p class="walk-say"><span class="walk-title">Infrastructure ACLs — the outer fence</span>
An <b>infrastructure ACL (iACL)</b> is applied inbound at the network edge and denies the outside world from addressing your <b>infrastructure</b> — loopbacks, point-to-point links, management subnets — while permitting transit traffic to the services behind them.
<br><br>The logic: a legitimate user sends packets to a <i>server</i>, never to a <i>backbone link</i>. So anything from outside aimed at an infrastructure address is either a mistake or an attack, and dropping it removes a huge class of reconnaissance and direct-to-CPU attacks before CoPP ever has to. iACLs and CoPP are complementary — the fence and the guard.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="CoPP classifies control traffic and polices each class to a rate before it reaches the CPU">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv3 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.sv3 .b{fill:#F1EEE9;stroke:#B5B5BC}.sv3 .cpu{fill:rgba(31,157,107,.16);stroke:#1f9d6b}</style>
  <rect class="b" x="14" y="34" width="150" height="24"/><text class="m" x="24" y="51">routing (OSPF/BGP)</text>
  <rect class="b" x="14" y="64" width="150" height="24"/><text class="m" x="24" y="81">management (SSH/SNMP)</text>
  <rect class="b" x="14" y="94" width="150" height="24"/><text class="m" x="24" y="111">ICMP</text>
  <rect class="b" x="14" y="124" width="150" height="24"/><text class="m" x="24" y="141">everything else</text>
  <text class="s" x="180" y="66">police 500k, drop over</text>
  <text class="s" x="180" y="96">police 100k</text>
  <text class="s" x="180" y="126">police 50k, drop over</text>
  <text class="s" x="180" y="156" fill="#B80027">police low, drop over ← the catch-all matters most</text>
  <rect class="cpu" x="470" y="70" width="150" height="44"/><text class="k" x="545" y="97" text-anchor="middle" fill="#0f6b47">CPU stays alive</text>
  <path d="M 330 90 L 470 92" stroke="#8A8A93" stroke-width="1.5"/>
  <text class="k" x="14" y="166"></text>
</svg>
<p class="walk-say"><span class="walk-title">CoPP — the guard on the CPU</span>
CoPP classifies inbound control traffic into categories and <b>polices each to a rate</b>. Routing protocols get a generous rate; management a modest one; ICMP a small one; and the <b>catch-all class</b> — everything not explicitly matched — gets a low rate and drops the excess.
<br><br>That catch-all is the part that does the real work: an attacker floods the CPU with <i>unclassified</i> junk, and CoPP caps it so your OSPF and SSH, in their own higher-rate classes, keep flowing. Build CoPP by <b>starting permissive and tightening</b> — police-and-count first, watch what conforms and exceeds, then lower rates. Set a class too tight and you drop your own routing, which looks exactly like a network failure.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 175" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="IPv6 first hop security validates router advertisements DHCP and neighbor discovery against a binding table">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <text class="k" x="14" y="26">IPv6 First-Hop Security — the Layer-2 doors IPv6 opened</text>
  <text class="s" x="14" y="50">IPv6 has no ARP and no DHCP-by-default — hosts autoconfigure from Router Advertisements and use</text>
  <text class="s" x="14" y="66">Neighbor Discovery. So the attacks moved: a rogue RA makes a host pick the attacker as gateway.</text>
  <text class="m" x="14" y="94">RA Guard      → drop RAs on host ports</text>
  <text class="m" x="14" y="110">DHCPv6 Guard  → drop server replies on host ports</text>
  <text class="m" x="14" y="126">ND Inspection → validate NS/NA against the binding table</text>
  <text class="m" x="14" y="142">Source Guard  → drop traffic from an unbound address</text>
  <text class="s" x="14" y="168">All of it hangs off the binding table: which IPv6 lives on which MAC, port and VLAN.</text>
</svg>
<p class="walk-say"><span class="walk-title">IPv6 First-Hop Security — the v6 equivalents</span>
IPv4's Layer-2 attacks are answered by <a href="/blog/layer-2-security-port-security-dhcp-snooping-and-dai">DHCP snooping and DAI</a>. IPv6 changed the mechanisms — no ARP, no DHCP by default, hosts autoconfigure from <b>Router Advertisements</b> — so it needs its own set:
<br><br><b>RA Guard</b> drops Router Advertisements arriving on host ports (only your routers should send RAs). <b>DHCPv6 Guard</b> drops server messages on host ports. <b>ND Inspection</b> validates Neighbor Discovery against the <b>binding table</b> — the source of truth mapping IPv6 ↔ MAC ↔ port ↔ VLAN. <b>Source Guard</b> drops data from an address not in that table. The single most common real incident it prevents: a Windows laptop with sharing misconfigured sending rogue RAs and black-holing a whole VLAN — usually an accident, occasionally not.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Reading CoPP means watching conform and exceed counters per class to tune rates">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv5 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <text class="k" x="14" y="26">Tuning CoPP is reading two counters per class</text>
  <text class="m" x="14" y="52">conformed 4821 packets  ← normal, within rate</text>
  <text class="m" x="14" y="72" fill="#B80027">exceeded 190233 packets ← being dropped: attack, OR your rate is too tight</text>
  <text class="s" x="14" y="100">Rising "exceeded" on the ROUTING class during an outage = you are policing your own OSPF/BGP.</text>
  <text class="s" x="14" y="116">Rising "exceeded" on the CATCH-ALL = CoPP absorbing junk exactly as intended.</text>
  <text class="s" x="14" y="144">Same counter, opposite meanings — which class it is on tells you which.</text>
</svg>
<p class="walk-say"><span class="walk-title">Reading CoPP — conform vs exceed</span>
Every policed class has two counters: <b>conformed</b> (within rate, allowed) and <b>exceeded</b> (over rate, dropped by the exceed action). Tuning CoPP is watching them.
<br><br>The interpretation depends entirely on <b>which class</b>. Exceeds climbing on the <b>catch-all</b> during an event is CoPP working — junk being capped. Exceeds climbing on the <b>routing</b> or <b>management</b> class is a warning — either a real attack on that category, or, far more often, <b>a rate you set too low and are now dropping your own OSPF/BGP/SSH</b>. That second case is the classic CoPP self-inflicted outage, and it is why you deploy CoPP in count-first mode before you let it drop.</p>
</div>
</div>
</div>

---

## Infrastructure security features

The two ENCOR building blocks for protecting the network's own plumbing, summarised — the mechanics are in the sections above and the configuration below.

### ACLs

**Access control lists** are the general-purpose filter, and for infrastructure protection they appear in three roles: an **infrastructure ACL (iACL)** at the edge that stops the outside world addressing your backbone; a **management-plane ACL** (an `access-class` on the vty lines) that limits who can even attempt to log in; and the **classification ACLs inside CoPP** that sort control traffic into classes. Same engine — ordered, first-match, implicit deny — pointed at protecting the device rather than the users behind it. Full ACL mechanics are in [access control lists](/blog/access-control-lists-wildcards-placement-ipv6-and-urpf).

### CoPP

**Control Plane Policing** is [QoS](/blog/qos-classification-marking-queuing-and-phb) applied to the router's CPU: classify inbound control traffic, police each class to a rate, and drop the excess — so a flood of routing, management or unclassified junk cannot starve the CPU that keeps the router alive and reachable. It is applied once, to the `control-plane`, covering every interface at once, and it rate-limits rather than blocks so legitimate protocols keep flowing. See [Why the control plane needs its own protection](#why-the-control-plane-needs-its-own-protection) and the configuration below.

---

## Configuration, word by word

<div class="cmd">
<div class="cmd-line"><span class="opt">! classify control traffic</span>
<span class="t">ip access-list extended</span> <span class="opt">CoPP-ROUTING</span>
 <span class="t">permit ospf any any</span>
 <span class="t">permit tcp any any eq</span> <span class="opt">179</span>
 <span class="t">permit eigrp any any</span>
<span class="t">ip access-list extended</span> <span class="opt">CoPP-MGMT</span>
 <span class="t">permit tcp</span> <span class="opt">10.0.0.0 0.0.0.255</span> <span class="t">any eq</span> <span class="opt">22</span>
 <span class="t">permit udp</span> <span class="opt">10.0.0.0 0.0.0.255</span> <span class="t">any eq</span> <span class="opt">161</span>
!
<span class="t">class-map match-all</span> <span class="opt">ROUTING</span>
 <span class="t">match access-group name</span> <span class="opt">CoPP-ROUTING</span>
<span class="t">class-map match-all</span> <span class="opt">MGMT</span>
 <span class="t">match access-group name</span> <span class="opt">CoPP-MGMT</span>
!
<span class="t">policy-map</span> <span class="opt">CoPP</span>
 <span class="t">class</span> <span class="opt">ROUTING</span>
  <span class="t">police</span> <span class="opt">500000</span> <span class="t">conform-action transmit exceed-action transmit</span>
 <span class="t">class</span> <span class="opt">MGMT</span>
  <span class="t">police</span> <span class="opt">100000</span> <span class="t">conform-action transmit exceed-action drop</span>
 <span class="t">class class-default</span>
  <span class="t">police</span> <span class="opt">50000</span> <span class="t">conform-action transmit exceed-action drop</span>
!
<span class="t">control-plane</span>
 <span class="t">service-policy input</span> <span class="opt">CoPP</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>class-map / class-default</dt><dd>Same MQC as data-plane QoS. The one that matters most is <b><code>class-default</code></b> — the catch-all for control traffic you did not classify. That is where an attack's junk lands, so it gets the lowest rate.</dd></div>
<div class="is-key"><dt>exceed-action transmit <br><span class="opt">(on ROUTING, at first)</span></dt><dd><b>Deploy in count-first mode.</b> Setting <code>exceed-action transmit</code> on the important classes means CoPP <i>counts</i> what would exceed without dropping it — so you can watch real rates for a week and size the policy from data, not guesswork, before switching to <code>drop</code>. Dropping routing you have not measured is how CoPP causes outages.</dd></div>
<div><dt>police 500000</dt><dd>Bits per second. Routing gets headroom (a full reconvergence is bursty); management less; the catch-all least. These numbers are a starting point — the <b>right</b> values come from measuring your own control-plane baseline.</dd></div>
<div class="is-key"><dt>CoPP-MGMT scoped to 10.0.0.0/24</dt><dd><b>Scope management to your management subnet.</b> SSH and SNMP from anywhere else should fall into class-default and be capped hard — combine this with an <code>access-class</code> on the vty lines and a management-plane ACL. Defence in depth on the one plane an attacker most wants.</dd></div>
<div class="is-key"><dt>control-plane / <br>service-policy input</dt><dd>Applied to the <b><code>control-plane</code></b>, not an interface — so it covers punted traffic arriving on <i>every</i> interface at once. This is the whole reason CoPP exists rather than per-interface ACLs.</dd></div>
</dl>
</div>

<div class="cmd">
<div class="cmd-line"><span class="opt">! IPv6 First-Hop Security on an access VLAN</span>
<span class="t">ipv6 nd inspection policy</span> <span class="opt">HOST-NDI</span>
<span class="t">ipv6 nd raguard policy</span> <span class="opt">HOST-RAG</span>
 <span class="t">device-role</span> <span class="opt">host</span>
!
<span class="t">vlan configuration</span> <span class="opt">20</span>
 <span class="t">ipv6 nd suppress</span>
 <span class="t">ipv6 snooping</span>
!
<span class="t">interface range</span> <span class="opt">Gi1/0/1 - 40</span>
 <span class="t">ipv6 nd raguard attach-policy</span> <span class="opt">HOST-RAG</span>
 <span class="t">ipv6 nd inspection attach-policy</span> <span class="opt">HOST-NDI</span>
 <span class="t">ipv6 source-guard attach-policy</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>ipv6 snooping / binding table</dt><dd><b>Everything depends on the binding table</b> — the mapping of IPv6 ↔ MAC ↔ port ↔ VLAN, learned by snooping ND and DHCPv6. RA Guard, ND Inspection and Source Guard all validate against it. No binding table, nothing to check against.</dd></div>
<div class="is-key"><dt>raguard … device-role host</dt><dd><b>RA Guard on host ports drops Router Advertisements.</b> Only ports facing your actual routers should be <code>device-role router</code>; every access port is <code>host</code>, so a laptop sending rogue RAs is dropped at the switch. This is the highest-value v6 first-hop control.</dd></div>
<div><dt>nd inspection</dt><dd>Validates Neighbor Solicitation/Advertisement against the binding table — the IPv6 equivalent of Dynamic ARP Inspection, stopping ND spoofing / man-in-the-middle.</dd></div>
<div><dt>source-guard</dt><dd>Drops data-plane traffic whose source IPv6 is not in the binding table — the equivalent of IP Source Guard, stopping address spoofing from a port.</dd></div>
<div class="is-key"><dt>device-role on trunk/router ports</dt><dd><b>The classic mistake:</b> applying host RA Guard to the uplink toward your real router, which then drops legitimate RAs and breaks IPv6 for the whole VLAN. Router-facing ports must be <code>device-role router</code>.</dd></div>
</dl>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — is CoPP protecting, or is it dropping your own traffic?</div>
<pre><span class="p">R1#</span> <span class="c">show policy-map control-plane input</span>
 Control Plane
  Service-policy input: CoPP

    Class-map: ROUTING (match-all)
      <span class="g">conformed 48210 packets</span>; exceeded 0 packets
      police: cir 500000 bps
        conformed 48210 packets, actions: transmit
        <span class="g">exceeded 0 packets, actions: transmit</span>
      <span class="o">! routing healthy — zero exceed. Good.</span>

    Class-map: MGMT (match-all)
      conformed 1204 packets; <span class="r">exceeded 88401 packets</span>
      police: cir 100000 bps
        <span class="r">exceeded 88401 packets, actions: drop</span>
      <span class="o">! management class flooded — an SSH/SNMP attack, OR the rate is too low.</span>
      <span class="o">! check the SOURCE before lowering anything further.</span>

    Class-map: class-default
      conformed 9120 packets; <span class="y">exceeded 2841002 packets</span>
        <span class="y">exceeded 2841002 packets, actions: drop</span>
      <span class="o">! catch-all absorbing a flood — CoPP doing exactly its job.</span>

<span class="p">R1#</span> <span class="c">show ipv6 neighbor binding</span>
    IPv6 address        Link-Layer addr  Interface vlan  prlvl  age  state
    2001:DB8:20::10     0050.5601.aa10   Gi1/0/5    20    NO    5    REACHABLE
    FE80::250:56FF:...  0050.5601.aa10   Gi1/0/5    20    NO    5    REACHABLE
    <span class="o">! the binding table — the source of truth RA Guard/ND/Source Guard check against.</span>

<span class="p">R1#</span> <span class="c">show ipv6 snooping counters interface Gi1/0/5 | include RA|dropped</span>
     Received messages on Gi1/0/5:  RA 0
     <span class="g">Dropped messages: RA 14</span>
     <span class="o">! 14 Router Advertisements dropped on a host port — RA Guard caught a rogue RA.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>For CoPP, the counter is meaningless without the class.</b> Exceeds on class-default are the system working; exceeds on routing or management are a warning to investigate the source — and only lower a rate once you have proven the traffic is not legitimate. For IPv6 FHS, the binding table and the snooping drop counters tell you what was caught and why.</p>

<div class="real">
<b>In the real world</b>
CoPP is one of those controls that does nothing visible for years and then saves the network on one bad day — a control-plane flood, a misbehaving device hammering the CPU with ARP or ICMP, a scanning tool aimed at the management addresses. The routers that stay manageable through it are the ones with a tuned CoPP and a catch-all that drops the junk.
<br><br>The mistake that causes outages is deploying CoPP with aggressive drop rates copied from a guide, without measuring your own baseline — and discovering during the next reconvergence that your BGP updates are being policed. <b>Count first, drop later.</b>
<br><br>IPv6 First-Hop Security is increasingly not optional: dual-stack networks that hardened IPv4 at Layer 2 and left IPv6 wide open have a rogue-RA-shaped hole, and the commonest trigger is not an attacker at all — it is an end user's misconfigured device advertising itself as a router.
</div>

---

## What goes wrong

**CoPP deployed, routing flaps.** Rate on the routing class too low — you are policing your own OSPF/BGP. Count first.

**CoPP does nothing under a flood.** No catch-all `police` on class-default, so unclassified junk reaches the CPU uncapped.

**Management reachable from anywhere despite CoPP.** CoPP rate-limits; it does not scope by source unless the ACL does. Add source scoping and an `access-class`.

**IPv6 breaks for a whole VLAN.** RA Guard `device-role host` applied to the router-facing port. Set router ports to `device-role router`.

**Source Guard drops legitimate traffic.** Binding table not populated — snooping not enabled, or the host uses an address it never announced.

**iACL blocks management.** The infrastructure ACL denied your own management subnet to the infrastructure range. Permit management explicitly before the deny.

---

<div class="lab">
<div class="lab-head">Lab — protect the CPU, then prove it without breaking routing</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a CoPP policy in count-first mode, measure your real control-plane rates, then tighten the catch-all so junk is dropped while routing and management stay healthy. Then enable IPv6 First-Hop Security and watch a rogue Router Advertisement be dropped at the switch. Defensive throughout — you generate ordinary control traffic, not attacks.</div>

**Topology.** A lab router running OSPF or BGP with a neighbour, a management host, and (for the v6 part) a switch with an IPv6 access VLAN and two hosts.

<p class="lab-step"><span class="n">1</span>Baseline the control plane in count-first mode</p>

Build the CoPP class-maps and policy-map from above, but set **every** class to `exceed-action transmit` (count, don't drop). Apply it, then let it run while routing is up.

```cisco
R1# show policy-map control-plane input
```

<div class="lab-watch"><b>Things to notice</b>
Nothing is dropped yet — you are only <b>measuring</b>. Watch the <code>conformed</code> counts on ROUTING and MGMT climb at their real rates. <b>These numbers are the data you size the policy from.</b> Note the routing class's bursts when you bounce a neighbour and it reconverges — that burst is why routing needs headroom.</div>

<p class="lab-step"><span class="n">2</span>Turn on dropping, carefully</p>

Change **class-default** and MGMT to `exceed-action drop`, but leave ROUTING at `transmit` for now.

<div class="lab-watch"><b>Things to notice</b>
Generate ordinary management traffic (a few SSH sessions, an SNMP walk) and confirm it <b>conforms</b>, not exceeds. If MGMT starts exceeding under normal use, your rate is too low — raise it. <b>Tune to your real traffic, not to a number from a guide.</b></div>

<p class="lab-step"><span class="n">3</span>Flood the catch-all (with benign traffic) and watch CoPP hold</p>

From the management host, send a sustained burst of pings to the router's own address (this lands in class-default). Watch the counters and the router's CPU.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>CPU still spikes</b> — the traffic matched a class with a high rate; confirm it is landing in class-default.</li>
<li><b>Your SSH drops too</b> — management and the ping share a class; scope them apart.</li>
<li><b>Nothing is dropped</b> — your burst is under the catch-all rate; increase it or lower the rate for the test.</li>
</ul>
<code>class-default</code> <b>exceeded</b> climbs while <b>CPU stays low and your SSH session stays responsive</b>. That is the whole value of CoPP in one observation — the junk is capped, the router stays manageable. Then, only now that you have measured it, set ROUTING to <code>drop</code> with the headroom from step 1.</div>

<p class="lab-step"><span class="n">4</span>Enable IPv6 First-Hop Security</p>

On the switch, enable `ipv6 snooping` on the VLAN and attach RA Guard (`device-role host`) and ND inspection to the access ports. Leave the router-facing port as `device-role router`.

```cisco
SW1# show ipv6 neighbor binding
```

<div class="lab-watch"><b>Things to notice</b>
The binding table populates as hosts use IPv6. Confirm your **router's** RAs still arrive (the router port is `device-role router`) — if IPv6 breaks here, you attached host RA Guard to the uplink, the classic mistake.</div>

<p class="lab-step"><span class="n">5</span>Produce a rogue RA the safe way</p>

On one **host** in the VLAN, enable IPv6 routing/RA advertising (e.g. turn on internet-connection-sharing or `sysctl` RA on a lab Linux box) so it starts sending Router Advertisements — a device misconfiguration, not an attack tool.

<div class="lab-watch"><b>Things to notice</b>
The switch **drops** those RAs on the host port. Check `show ipv6 snooping counters` for the dropped-RA count, and confirm other hosts in the VLAN did **not** pick up the rogue as a gateway. <b>Then disable RA Guard and repeat</b>: the other hosts now install a bogus default route and lose connectivity — which is exactly the accidental outage RA Guard prevents, reproduced with a misconfigured host rather than any malicious tooling.</div>

<div class="lab-earned"><b>What you earned</b>
You built CoPP the safe way — count first, measure, then drop — and watched it keep the CPU and your own SSH alive under a control-plane flood while dropping the junk in class-default. You know the two counters and that their meaning depends on the class. You enabled IPv6 First-Hop Security, saw the binding table it depends on, and watched RA Guard drop a rogue Router Advertisement — then saw the VLAN break without it. Every step protected infrastructure; none launched an attack.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>Why is CoPP needed when interface ACLs already exist?</p>
<label class="qz-opt"><input type="radio" name="isq1"><span>Control traffic is addressed to the router and arrives on every interface; CoPP polices it once, at the CPU, and rate-limits rather than blocks</span><em class="qz-fb qz-good">Correct — an interface ACL cannot rate-limit legitimate routing/management without blocking it, and would have to be repeated everywhere.</em></label>
<label class="qz-opt"><input type="radio" name="isq1"><span>CoPP is faster than an ACL</span><em class="qz-fb qz-bad">Speed is not the point; it is where and how it acts.</em></label>
<label class="qz-opt"><input type="radio" name="isq1"><span>ACLs cannot match routing protocols</span><em class="qz-fb qz-bad">They can; the issue is blocking vs rate-limiting traffic to the CPU.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Rising <code>exceeded</code> counts on the CoPP routing class during an outage means what?</p>
<label class="qz-opt"><input type="radio" name="isq2"><span>You may be policing your own OSPF/BGP — the rate is likely too low</span><em class="qz-fb qz-good">Correct. Exceeds on routing/management are a warning; investigate before lowering further.</em></label>
<label class="qz-opt"><input type="radio" name="isq2"><span>CoPP is working perfectly</span><em class="qz-fb qz-bad">That interpretation fits the catch-all class, not routing.</em></label>
<label class="qz-opt"><input type="radio" name="isq2"><span>The ACL is misconfigured</span><em class="qz-fb qz-bad">Possible, but the immediate signal is that routing is being dropped.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>What does RA Guard protect against?</p>
<label class="qz-opt"><input type="radio" name="isq3"><span>Rogue Router Advertisements — a host claiming to be the IPv6 gateway</span><em class="qz-fb qz-good">Correct, and the commonest trigger is an accidentally-misconfigured end host, not an attacker.</em></label>
<label class="qz-opt"><input type="radio" name="isq3"><span>Rogue DHCPv6 servers</span><em class="qz-fb qz-bad">That is DHCPv6 Guard.</em></label>
<label class="qz-opt"><input type="radio" name="isq3"><span>Spoofed source addresses</span><em class="qz-fb qz-bad">That is Source Guard.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>What is the right way to deploy CoPP?</p>
<label class="qz-opt"><input type="radio" name="isq4"><span>Count first (exceed-action transmit), measure real rates, then switch to drop</span><em class="qz-fb qz-good">Correct — dropping rates you have not measured is how CoPP causes outages.</em></label>
<label class="qz-opt"><input type="radio" name="isq4"><span>Apply aggressive drop rates from a design guide immediately</span><em class="qz-fb qz-bad">That risks policing your own control plane.</em></label>
<label class="qz-opt"><input type="radio" name="isq4"><span>Only police the routing class</span><em class="qz-fb qz-bad">The catch-all is where attack junk lands and matters most.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>What do all the IPv6 First-Hop Security features depend on?</p>
<label class="qz-opt"><input type="radio" name="isq5"><span>The binding table — IPv6 ↔ MAC ↔ port ↔ VLAN, learned by snooping</span><em class="qz-fb qz-good">Correct — ND Inspection and Source Guard validate against it; without it there is nothing to check.</em></label>
<label class="qz-opt"><input type="radio" name="isq5"><span>DHCPv6 being enabled</span><em class="qz-fb qz-bad">IPv6 often uses SLAAC, not DHCPv6; the binding table still forms from snooping.</em></label>
<label class="qz-opt"><input type="radio" name="isq5"><span>CoPP</span><em class="qz-fb qz-bad">CoPP protects the CPU; it is unrelated to the FHS binding table.</em></label>
</div>

---

## References

- Cisco — [Control Plane Policing](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/qos_plcshp/configuration/xe-17/qos-plcshp-xe-17-book/qos-plcshp-ctrl-pln-plc.html)
- Cisco — [IPv6 First-Hop Security Configuration Guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipv6_fhsec/configuration/xe-17/ip6f-xe-17-book.html)
- Cisco — [Protecting Your Core: Infrastructure Protection ACLs](https://www.cisco.com/c/en/us/support/docs/ip/access-lists/43920-iacl.html)
- **RFC 6105** — IPv6 Router Advertisement Guard.

---

*Related: [Access control lists and uRPF](/blog/access-control-lists-wildcards-placement-ipv6-and-urpf) · [Layer 2 security](/blog/layer-2-security-port-security-dhcp-snooping-and-dai) · [QoS](/blog/qos-classification-marking-queuing-and-phb) · [Security fundamentals](/blog/security-fundamentals-threats-policy-and-network-design).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
