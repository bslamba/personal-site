---
title: "Virtualization for Network Engineers: Where the Switch Went"
excerpt: "There is a switch inside every hypervisor and you probably do not manage it. Traffic between two VMs on the same host never touches a cable, never crosses your access switch, and never appears in anything you monitor — which is exactly where the surprises live."
date: "2026-09-21"
tags: ["Virtualization", "Containers", "VRF", "VDC", "Hypervisor", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 1.12 *Explain virtualization fundamentals (server virtualization, containers, and VRFs)*. ENCOR 350-401 — 2.1 *Describe device virtualization technologies*, 2.3 *Describe network virtualization concepts*.

## Cheat sheet

| Server virtualization | Is |
|---|---|
| **Type 1 hypervisor** | Runs on bare metal — ESXi, Hyper-V, KVM. **Production** |
| **Type 2 hypervisor** | Runs on an OS — VMware Workstation, VirtualBox. **Your laptop** |
| **VM** | Full guest OS. Heavy, isolated, boots in seconds-to-minutes |
| **Container** | **Shares the host kernel.** Megabytes, starts in milliseconds |
| **vSwitch** | A switch inside the hypervisor. **Traffic between VMs never leaves the host** |

| Device virtualization | Splits or joins |
|---|---|
| **VRF** | One router → many routing tables |
| **VDC** (Nexus) | One switch → **separate devices**, own processes and admins |
| **VLAN** | One switch → many broadcast domains |
| **StackWise / VSS** | **Many switches → one** logical device |
| **VSS/vPC** | Two chassis, one logical — **no blocked links** |

| Network virtualization | Does |
|---|---|
| **VRF-lite** | Path isolation, per-hop, no MPLS |
| **MPLS L3VPN** | Path isolation across a provider |
| **VXLAN** | L2 over L3, **16 million** segments |
| **GRE / IPsec** | Tunnels over anything |
| **LISP** | Separates *who* from *where* |

**The sentence with operational consequences.** Two VMs on the same host talking to each other produce traffic that **never reaches a physical port**. Your SPAN session cannot see it, your access switch never counts it, and your ACLs never evaluate it. The first time this matters is usually during an incident.

---

## Device virtualization technologies, one by one

Virtualization means one physical thing presenting as several logical ones (or several as one). The blueprint names three device-level building blocks and two network-level ones.

### Hypervisor type 1 and 2

A **hypervisor** creates and runs virtual machines by presenting virtual hardware to each. **Type 1 (bare-metal)** runs directly on the hardware — ESXi, Hyper-V, KVM — and is what production uses. **Type 2 (hosted)** runs as an application on top of a normal OS — VMware Workstation, VirtualBox — and is what you run on a laptop.

- **Beginner:** type 1 = the server *is* the hypervisor; type 2 = a program on your desktop.
- **Working knowledge:** type 1 is faster and more secure because there is no host OS between it and the hardware; type 2 is convenient for labs and testing.
- **Pro:** the type matters to the network because a type-1 host aggregates many VMs behind **one set of NICs and one switch port**, which is why that port shows many MACs and is usually a trunk — see [Where the traffic goes](#where-the-traffic-goes).

### Virtual machine

A **virtual machine (VM)** is a complete guest operating system running on virtual hardware — its own kernel, its own IP stack, its own MAC address. It is strongly isolated from other VMs and boots like a real machine.

- **Beginner:** a whole computer, in software, sharing physical hardware with others.
- **Working knowledge:** each VM's virtual NIC has its **own MAC**, which appears in your switch's table via the host uplink; **vMotion** moves a running VM to another host, so a MAC can appear on a different switch port with no change to the VM.
- **Pro:** contrast with a **container**, which shares the host kernel and so is far lighter but less isolated — the distinction that drives how you segment and secure each. See [Four kinds of virtualization](#four-kinds-of-virtualization).

### Virtual switching

A **virtual switch (vSwitch)** is a software switch **inside the hypervisor** that connects VMs to each other and to the physical NICs. It does MAC learning and VLAN tagging just like a hardware switch — and traffic between two VMs on the same host crosses **only** the vSwitch, never a physical cable.

- **Beginner:** the switch built into the virtualization host that the VMs plug into.
- **Working knowledge:** the vSwitch uplink to your physical switch is a **trunk**; a VLAN missing from that trunk's allowed list is the classic "the VM can't reach anything" fault, and it is reported as a server problem.
- **Pro:** because intra-host VM traffic never reaches your switch, it is **invisible** to your SPAN, ACLs and NetFlow — visibility and east-west policy require a distributed vSwitch or host-based enforcement, not the physical network. This is the single most important consequence of virtualization for a network engineer.

---

## Network virtualization concepts

Network virtualization carries many logical networks over one physical one. Two mechanisms dominate, both used by [SD-Access and modern fabrics](/blog/sdn-controllers-overlays-sd-access-and-sd-wan).

### LISP

**LISP (Locator/ID Separation Protocol)** splits *who* a device is (its endpoint identifier, EID) from *where* it is (its routing locator, RLOC). A **map server** holds the EID-to-RLOC mappings, and routers **query** it on demand instead of every router carrying every route.

- **Beginner:** a directory that says "this endpoint is currently behind that router," looked up when needed.
- **Working knowledge:** it is the **control plane** of SD-Access — ask-don't-flood, so a fabric can be one large space without one large broadcast domain, and an endpoint keeps its address as it roams.
- **Pro:** separating identity from location is what makes mobility and scale work — the EID never changes, only the RLOC mapping updates, so moving a device is a map-server update, not a re-addressing exercise.

### VXLAN

**VXLAN (Virtual Extensible LAN)** tunnels Layer-2 frames inside UDP so a VLAN can span a routed network. Its **24-bit VNI** allows ~16 million segments versus 802.1Q's 4094, and Cisco's variant also carries a **group tag (SGT)** in the header for policy.

- **Beginner:** wraps Ethernet in IP/UDP so a "VLAN" can cross routers, with far more segments than VLANs allow.
- **Working knowledge:** it is the **data plane** of SD-Access; endpoints stay in their segment (VNI) wherever they connect, and policy travels as the SGT rather than as an address-based ACL.
- **Pro:** VXLAN adds ~50 bytes of overhead, so fabric underlays run **jumbo frames** end-to-end — the commonest fabric fault (pings fine, large transfers hang) is a missed MTU, not the controller. Byte-level detail in [the SD-Access data plane](/blog/sdn-controllers-overlays-sd-access-and-sd-wan).

---

## Where the traffic goes

<figure class="fig">
<svg viewBox="0 0 640 285" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Traffic between two virtual machines on one host stays inside the hypervisor switch">
  <style>
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}
    .n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}
    .host{fill:none;stroke:#4b7bec;stroke-width:1.5;stroke-dasharray:5 4}
    .vs{fill:rgba(75,123,236,.16);stroke:#4b7bec}
  </style>
  <rect class="host" x="14" y="20" width="360" height="160" rx="4"/>
  <text class="s" x="26" y="38" fill="#2f5fd0">PHYSICAL HOST</text>
  <rect class="n" x="40" y="50" width="80" height="30" rx="3"/><text class="nt" x="80" y="70" text-anchor="middle">VM-A</text>
  <rect class="n" x="150" y="50" width="80" height="30" rx="3"/><text class="nt" x="190" y="70" text-anchor="middle">VM-B</text>
  <rect class="n" x="260" y="50" width="80" height="30" rx="3"/><text class="nt" x="300" y="70" text-anchor="middle">VM-C</text>
  <rect class="vs" x="40" y="106" width="300" height="32"/><text class="m" x="190" y="126" text-anchor="middle">vSwitch — a switch you may not manage</text>
  <line x1="80" y1="80" x2="80" y2="106" stroke="#8A8A93"/>
  <line x1="190" y1="80" x2="190" y2="106" stroke="#8A8A93"/>
  <line x1="300" y1="80" x2="300" y2="106" stroke="#8A8A93"/>
  <path d="M 80 106 L 80 96 L 190 96 L 190 106" fill="none" stroke="#1f9d6b" stroke-width="2.5"/>
  <circle r="3.5" fill="#1f9d6b"><animateMotion dur="1.4s" repeatCount="indefinite" path="M 80 100 L 190 100"/></circle>
  <line x1="190" y1="138" x2="190" y2="160" stroke="#8A8A93" stroke-width="2"/>
  <rect class="n" x="450" y="106" width="100" height="32" rx="3"/><text class="nt" x="500" y="126" text-anchor="middle">YOUR SWITCH</text>
  <line x1="190" y1="160" x2="450" y2="130" stroke="#8A8A93" stroke-width="2"/>
  <text class="s" x="330" y="172">uplink — only traffic LEAVING the host</text>
  <rect x="14" y="196" width="612" height="44" fill="rgba(211,0,45,.08)" stroke="#D3002D"/>
  <text class="k" x="26" y="216" fill="#B80027">VM-A to VM-B never touches a cable. Your SPAN session cannot see it.</text>
  <text class="s" x="26" y="234">Neither can your access-port ACLs, your NetFlow exporter, or your interface counters.</text>
  <rect x="14" y="250" width="612" height="30" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="s" x="26" y="270" fill="#0f6b47">To see or control it you need something on the host — a distributed switch, or host-based policy.</text>
</svg>
<figcaption><b>Figure 1.</b> The first switch in the path is inside the server, and it is usually owned by a different team.</figcaption>
</figure>

<div class="why">
<b>The organisational problem that follows from the technical one</b>
The vSwitch belongs to the virtualization team; the physical switch belongs to you. The boundary runs through the middle of the path, and <b>each side can see only their half</b>.
<br><br>Which produces a familiar conversation. "Is the network dropping it?" "Nothing is dropping on my side." Both true, because the packet never reached your side.
<br><br>Two things make it tractable: know which VLANs the uplink trunk carries (an <b>allowed-VLAN mismatch on the trunk</b> to a host is a classic and looks exactly like a server fault), and get read access to the vSwitch configuration. You do not need to administer it. You need to be able to see it.
</div>

---

## Four kinds of virtualization

<div class="walk">
<div class="walk-head">What each one actually splits <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="vtw" id="vt1" checked><label for="vt1"><span class="step-n">1</span>VMs</label>
  <input type="radio" name="vtw" id="vt2"><label for="vt2"><span class="step-n">2</span>Containers</label>
  <input type="radio" name="vtw" id="vt3"><label for="vt3"><span class="step-n">3</span>VRF and VDC</label>
  <input type="radio" name="vtw" id="vt4"><label for="vt4"><span class="step-n">4</span>Many into one</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Each virtual machine runs a complete guest operating system on top of a hypervisor">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.g{fill:rgba(75,123,236,.16);stroke:#4b7bec}.h{fill:#E4E4E9;stroke:#B5B5BC}.hw{fill:#17171A}</style>
  <rect class="g" x="30" y="28" width="170" height="52"/><text class="m" x="115" y="48" text-anchor="middle">guest OS</text><text class="m" x="115" y="66" text-anchor="middle">app</text>
  <rect class="g" x="212" y="28" width="170" height="52"/><text class="m" x="297" y="48" text-anchor="middle">guest OS</text><text class="m" x="297" y="66" text-anchor="middle">app</text>
  <rect class="g" x="394" y="28" width="170" height="52"/><text class="m" x="479" y="48" text-anchor="middle">guest OS</text><text class="m" x="479" y="66" text-anchor="middle">app</text>
  <rect class="h" x="30" y="88" width="534" height="28"/><text class="m" x="297" y="107" text-anchor="middle">HYPERVISOR</text>
  <rect class="hw" x="30" y="124" width="534" height="26"/><text x="297" y="142" text-anchor="middle" fill="#FAF8F5" font-family="ui-monospace,Menlo,monospace" font-size="10">physical hardware</text>
  <text class="k" x="14" y="180">A whole operating system each. Strong isolation, gigabytes, boots like a real machine.</text>
</svg>
<p class="walk-say"><span class="walk-title">Virtual machines — a whole computer, in software</span>
The hypervisor presents virtual hardware and each VM runs a complete guest OS on it. <b>Type 1</b> runs on bare metal and is what production uses; <b>Type 2</b> runs on top of a desktop OS and is what your lab uses.
<br><br>Networking-wise, each VM has a virtual NIC with <b>its own MAC address</b>, which appears in your switch's MAC table via the host's uplink. So a single physical port can legitimately show dozens of MACs — worth remembering before you set <code>switchport port-security maximum 1</code> on a server port.
<br><br>And <b>vMotion</b> changes the shape of the problem: a VM moves to another host and its MAC appears on a different switch port, with the address unchanged. Your Layer 2 design has to allow that, which is a large part of why data centres went to overlays.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Containers share the host kernel so they are much smaller and faster to start than virtual machines">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.c{fill:rgba(31,157,107,.18);stroke:#1f9d6b}.h{fill:#E4E4E9;stroke:#B5B5BC}.hw{fill:#17171A}</style>
  <rect class="c" x="30" y="28" width="98" height="34"/><text class="m" x="79" y="49" text-anchor="middle">app</text>
  <rect class="c" x="138" y="28" width="98" height="34"/><text class="m" x="187" y="49" text-anchor="middle">app</text>
  <rect class="c" x="246" y="28" width="98" height="34"/><text class="m" x="295" y="49" text-anchor="middle">app</text>
  <rect class="c" x="354" y="28" width="98" height="34"/><text class="m" x="403" y="49" text-anchor="middle">app</text>
  <rect class="c" x="462" y="28" width="98" height="34"/><text class="m" x="511" y="49" text-anchor="middle">app</text>
  <rect class="h" x="30" y="70" width="530" height="28"/><text class="m" x="295" y="89" text-anchor="middle">SHARED HOST KERNEL</text>
  <rect class="hw" x="30" y="106" width="530" height="26"/><text x="295" y="124" text-anchor="middle" fill="#FAF8F5" font-family="ui-monospace,Menlo,monospace" font-size="10">physical hardware</text>
  <text class="k" x="14" y="162">No guest OS. Megabytes, not gigabytes. Milliseconds, not minutes.</text>
  <text class="s" x="14" y="186">The trade: weaker isolation, because a kernel vulnerability is shared by everything on the host.</text>
</svg>
<p class="walk-say"><span class="walk-title">Containers — the OS, shared</span>
A container packages an application and its dependencies but <b>uses the host's kernel</b>. No guest OS means megabytes instead of gigabytes and startup in milliseconds.
<br><br>What this changes for you: <b>containers appear and disappear constantly</b>, often many per second, and they usually share the host's IP behind NAT or get addresses from an overlay the orchestrator manages. An address-based firewall rule is meaningless against something that lives for forty seconds.
<br><br>Which is why container platforms do policy by <b>label</b> — "frontend may talk to backend" — and why that idea is the same one as <a href="/blog/sdn-controllers-overlays-sd-access-and-sd-wan">SGTs in SD-Access</a>. Different vendors, same realisation: policy keyed to addresses stopped working when addresses stopped being stable.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A VRF splits the routing table while a VDC splits the whole device">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.a{fill:rgba(75,123,236,.16);stroke:#4b7bec}.b{fill:rgba(31,157,107,.16);stroke:#1f9d6b}.f{fill:#F1EEE9;stroke:#B5B5BC}.hdr{font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700;letter-spacing:.06em;fill:#8A8A93}</style>
  <text class="hdr" x="14" y="20">VRF — separate routing tables, one device</text>
  <rect class="f" x="14" y="28" width="290" height="70"/>
  <rect class="a" x="26" y="38" width="130" height="24"/><text class="m" x="91" y="55" text-anchor="middle">VRF RED</text>
  <rect class="b" x="164" y="38" width="130" height="24"/><text class="m" x="229" y="55" text-anchor="middle">VRF BLUE</text>
  <text class="s" x="26" y="82">one control plane, one CPU, one admin</text>
  <text class="hdr" x="336" y="20">VDC — separate devices, one chassis</text>
  <rect class="f" x="336" y="28" width="290" height="70"/>
  <rect class="a" x="348" y="38" width="130" height="24"/><text class="m" x="413" y="55" text-anchor="middle">VDC-1</text>
  <rect class="b" x="486" y="38" width="130" height="24"/><text class="m" x="551" y="55" text-anchor="middle">VDC-2</text>
  <text class="s" x="348" y="82">own processes, own admins, own reload</text>
  <text class="k" x="14" y="130">A VRF isolates routing. A VDC isolates everything — including the failure domain.</text>
  <text class="s" x="14" y="156">Crash a process in one VDC and the other is unaffected. A VRF shares the control plane, so a CPU</text>
  <text class="s" x="14" y="172">problem affects every VRF at once. That difference is the whole reason VDCs exist.</text>
  <text class="s" x="14" y="194">Both are <tspan font-weight="700">one into many</tspan>. The next panel is the opposite.</text>
</svg>
<p class="walk-say"><span class="walk-title">VRF splits the table; VDC splits the device</span>
A <b>VRF</b> gives you multiple independent routing tables on one router — overlapping address space, no leaking between them unless you configure it. Cheap, widely supported, and the foundation of <a href="/blog/mpls-lsr-ldp-label-switching-and-l3vpn">MPLS L3VPN</a> and <a href="/blog/vrf-lite-and-gre-tunnels-explained">VRF-lite</a>.
<br><br>A <b>VDC</b> on Nexus goes much further: separate processes, separate configuration, separate administrators, and a separate failure domain. One VDC can be reloaded without touching the other.
<br><br>The distinction worth remembering: <b>a VRF shares the control plane, a VDC does not.</b> So a CPU or process problem hits every VRF simultaneously, and that is precisely what a VDC is buying you protection from.</p>
</div>
<div class="walk-panel">
<svg viewBox="0 0 640 195" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stacking and virtual switching combine several physical switches into one logical device">
  <style>.s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}.n{fill:#17171A}.nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:10px;font-weight:700}.log{fill:none;stroke:#1f9d6b;stroke-width:2;stroke-dasharray:6 4}</style>
  <rect class="n" x="60" y="40" width="110" height="28" rx="3"/><text class="nt" x="115" y="58" text-anchor="middle">SW1</text>
  <rect class="n" x="60" y="78" width="110" height="28" rx="3"/><text class="nt" x="115" y="96" text-anchor="middle">SW2</text>
  <rect class="log" x="46" y="28" width="138" height="92" rx="4"/>
  <text class="m" x="115" y="136" text-anchor="middle" fill="#0f6b47">one logical switch</text>
  <rect class="n" x="420" y="60" width="110" height="28" rx="3"/><text class="nt" x="475" y="78" text-anchor="middle">server</text>
  <line x1="170" y1="54" x2="420" y2="70" stroke="#1f9d6b" stroke-width="2"/>
  <line x1="170" y1="92" x2="420" y2="78" stroke="#1f9d6b" stroke-width="2"/>
  <text class="s" x="300" y="106" text-anchor="middle">one EtherChannel across TWO chassis</text>
  <text class="k" x="14" y="166">Both links forward. Spanning tree sees one switch, so there is nothing to block.</text>
  <text class="s" x="14" y="188">That is the point of VSS, StackWise and vPC — redundancy without losing half your bandwidth.</text>
</svg>
<p class="walk-say"><span class="walk-title">Many into one — and why it was worth doing</span>
<b>StackWise</b>, <b>VSS</b> and <b>vPC</b> make several physical switches behave as one logical device. The server sees a single EtherChannel even though its two links land on two different chassis.
<br><br>The gain is not just simpler management. Because <a href="/blog/spanning-tree-explained-root-election-port-roles-rstp">spanning tree</a> sees one switch, <b>there is no loop to break, so nothing is blocked</b> — you get chassis redundancy <i>and</i> full bandwidth, where a traditional design gave you redundancy at the cost of half your links.
<br><br>The risk to know about is <b>split-brain</b>: if the link joining the two chassis fails while both stay alive, both may claim to be the active device. Dual-active detection exists to prevent it, and configuring it is not optional.</p>
</div>
</div>
</div>

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>The switch's view of a virtualized host</div>
<pre><span class="p">SW1#</span> <span class="c">show mac address-table interface GigabitEthernet1/0/12</span>
          Mac Address Table
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  20    0050.5601.aa01    DYNAMIC     Gi1/0/12
  20    0050.5601.aa02    DYNAMIC     Gi1/0/12
  20    0050.5601.aa03    DYNAMIC     Gi1/0/12
  30    0050.5601.bb11    DYNAMIC     Gi1/0/12
  30    0050.5601.bb12    DYNAMIC     Gi1/0/12
Total Mac Addresses for this criterion: <span class="y">14</span>

<span class="o">! Fourteen MACs on one port, across two VLANs. That is one ESXi host.</span>
<span class="o">! 0050.56 is the VMware OUI — a useful tell when you are wondering</span>
<span class="o">! whether an unexpected MAC is a VM or somebody's unauthorised switch.</span>

<span class="p">SW1#</span> <span class="c">show interface GigabitEthernet1/0/12 switchport | include Trunking VLANs</span>
Trunking VLANs Enabled: <span class="r">20,40</span>
<span class="o">! VLAN 30 is NOT allowed on this trunk — but VMs in VLAN 30 exist on the host.</span>
<span class="o">! They will fail, and the server team will report it as a server problem.</span>
<span class="o">! This is the single most common virtualization/network boundary fault.</span>

<span class="p">R1#</span> <span class="c">show vrf</span>
  Name       Default RD        Protocols   Interfaces
  CUST-A     65000:100         ipv4        Gi0/2
  CUST-B     65000:200         ipv4        Gi0/3

<span class="p">R1#</span> <span class="c">ping vrf CUST-A 10.1.20.9</span>
<span class="o">! Forget "vrf CUST-A" and you ping from the GLOBAL table, which has no</span>
<span class="o">! route to it. "Success rate is 0 percent" and nothing is actually wrong.</span>

<span class="p">SW1#</span> <span class="c">show switch</span>
Switch#  Role     Mac Address     Priority  State
------------------------------------------------
*1       <span class="g">Active</span>   00aa.bbcc.0001  15        Ready
 2       <span class="g">Standby</span>  00aa.bbcc.0002  14        Ready<span class="cur"></span></pre>
</div>
<p class="term-cap"><b>The trunk allowed-VLAN list is where this boundary usually breaks.</b> A VM is created in a port group for VLAN 30, the host's uplink does not carry VLAN 30, and the symptom lands on the server team's desk. Checking `show interface switchport` against the port groups resolves it in seconds — and almost nobody thinks to look.</p>

<div class="real">
<b>In the real world</b>
The practical shift is that <b>you no longer see the whole path</b>. A packet from one application to another may cross a vSwitch, a host firewall, an overlay tunnel and a container network before it reaches anything you own.
<br><br>Two habits help more than any amount of theory. <b>Learn to read the virtualization side well enough to ask precise questions</b> — which port group, which VLAN, which uplink, is the uplink a trunk. And <b>know the OUIs</b>: <code>00:50:56</code> is VMware, <code>00:15:5d</code> is Hyper-V, <code>52:54:00</code> is KVM. An unexpected MAC that starts with one of those is a VM, not a rogue device.
<br><br>The failure you will actually meet is mundane and constant: <b>a VLAN missing from the host's uplink trunk</b>. It looks like a server fault from one side and like nothing at all from the other.
</div>

---

## What goes wrong

**VMs in one VLAN cannot communicate off-host.** VLAN missing from the uplink trunk's allowed list.

**Port security shuts down a server port.** Many VM MACs on one port. Raise the maximum or remove it.

**Traffic between VMs invisible to monitoring.** It never left the host. You need host-side visibility.

**MAC moves between switch ports.** vMotion. Expected, not a loop.

**`ping` fails from a router with VRFs.** Missing `vrf` keyword — pinged from the global table.

**Both stack members go active.** Split-brain. Configure dual-active detection.

**Container policy by IP does not hold.** Addresses are ephemeral. Policy must be label or identity based.

---

<div class="lab">
<div class="lab-head">Lab — find the vSwitch, then break the boundary on purpose</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
See a hypervisor from the network side: many MACs on one port, a trunk carrying several VLANs, and traffic between VMs that you cannot capture. Build the allowed-VLAN fault deliberately. Then use VRFs to run overlapping address space on one router and prove the isolation.</div>

**Setup.** Any hypervisor — ESXi, Proxmox, or KVM on a spare machine — connected to a switch you control. Plus a router for the VRF section. Even VirtualBox on a laptop with bridged networking demonstrates most of it.

<p class="lab-step"><span class="n">1</span>Look at the host from the switch</p>

```cisco
SW1# show mac address-table interface Gi1/0/12
SW1# show interface Gi1/0/12 switchport
```

<div class="lab-watch"><b>Things to notice</b>
Count the MAC addresses. Look up the <b>first three octets</b> — <code>00:50:56</code> for VMware, <code>52:54:00</code> for KVM — and confirm they are VMs.
<br><br>Then read the <b>Trunking VLANs Enabled</b> list and compare it against the port groups configured on the host. <b>Write both lists down side by side.</b> That comparison is the single most useful thing you can do at this boundary.</div>

<p class="lab-step"><span class="n">2</span>Prove the invisible traffic</p>

Put two VMs on the same host in the same VLAN. Start a SPAN session on the host's uplink port, then transfer a large file between the two VMs.

<div class="lab-watch"><b>Things to notice</b>
<b>The capture is empty.</b> Check the uplink's interface counters too — barely moving. Meanwhile the transfer is running at multiple gigabits between the VMs.
<br><br>Now move one VM to a different host and repeat: <b>the traffic appears immediately.</b> Same two VMs, same application, completely different visibility — determined entirely by which physical machine they happen to be running on.</div>

<p class="lab-step"><span class="n">3</span>Build the allowed-VLAN fault</p>

Create a VM in a port group for a VLAN that is **not** in the uplink trunk's allowed list.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>It works anyway</b> — the trunk allows all VLANs by default. Restrict it explicitly first.</li>
<li><b>Nothing works for any VM</b> — you removed the native or management VLAN too.</li>
<li><b>Cannot tell</b> — give the VM a static address and ping its gateway; that isolates it cleanly.</li>
</ul>
The VM gets no DHCP and cannot reach its gateway. <b>From the hypervisor everything looks correctly configured</b>, and it will be reported as a server problem. Add the VLAN to the trunk and it works instantly. <b>Time how long this would take without knowing to check.</b></div>

<p class="lab-step"><span class="n">4</span>Overlapping address space with VRFs</p>

```cisco
R1(config)# vrf definition RED
R1(config)# vrf definition BLUE
! put 10.1.1.1/24 on an interface in EACH vrf
```

<div class="lab-watch"><b>Things to notice</b>
<b>IOS accepts the same subnet twice</b> — something it refuses in the global table. <code>show ip route vrf RED</code> and <code>show ip route vrf BLUE</code> are entirely separate tables.
<br><br>Then <code>ping 10.1.1.2</code> without the <code>vrf</code> keyword and watch it fail from the global table. <b>Nothing is broken; you asked the wrong routing table.</b> That mistake costs people real time, and doing it once deliberately inoculates you.</div>

<p class="lab-step"><span class="n">5</span>Port security against a hypervisor</p>

```cisco
SW1(config-if)# switchport port-security
SW1(config-if)# switchport port-security maximum 1
```

<div class="lab-watch"><b>Things to notice</b>
The port goes <b>err-disabled</b> almost immediately, taking every VM on the host offline at once. <code>show port-security interface</code> shows the violation.
<br><br>This is a perfectly reasonable access-port hardening standard, applied to the wrong kind of port. <b>Templates applied uniformly across a switch do exactly this</b>, and it is worth having caused it once in a lab rather than at 09:00 on a Monday.</div>

<p class="lab-step"><span class="n">6</span>Watch containers come and go</p>

```bash
docker run -d --rm nginx && docker ps -q | head -1 | xargs docker inspect -f '{{.NetworkSettings.IPAddress}}'
```

Start and stop several, checking addresses each time.

<div class="lab-watch"><b>Things to notice</b>
Addresses are <b>reassigned constantly</b> and mean nothing beyond the lifetime of the container. Time how long one takes to start compared with a VM.
<br><br>Now imagine writing a firewall rule for that. <b>You cannot</b> — which is precisely why container platforms and <a href="/blog/sdn-controllers-overlays-sd-access-and-sd-wan">SD-Access</a> both ended up doing policy by label and group rather than by address.</div>

<div class="lab-earned"><b>What you earned</b>
You can recognise a hypervisor from the switch side by its MAC count and OUI. You have proved that VM-to-VM traffic on one host is invisible to your monitoring, and watched it become visible when a VM moves. You have built the missing-VLAN fault that gets reported as a server problem. You have run overlapping address space in VRFs and made the missing-<code>vrf</code>-keyword mistake in a lab instead of in production. And you have err-disabled a hypervisor uplink with a port-security template, which is a mistake worth making exactly once.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is the main difference between a VM and a container?</p>
<label class="qz-opt"><input type="radio" name="vq1"><span>A VM runs a full guest OS; a container shares the host kernel</span><em class="qz-fb qz-good">Correct — hence megabytes and milliseconds instead of gigabytes and minutes, at the cost of weaker isolation.</em></label>
<label class="qz-opt"><input type="radio" name="vq1"><span>Containers cannot be networked</span><em class="qz-fb qz-bad">They have sophisticated networking, usually via an overlay.</em></label>
<label class="qz-opt"><input type="radio" name="vq1"><span>VMs cannot be moved between hosts</span><em class="qz-fb qz-bad">vMotion does exactly that, and it is one of the main reasons overlays exist.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Why can your SPAN session not see traffic between two VMs on one host?</p>
<label class="qz-opt"><input type="radio" name="vq2"><span>It is switched inside the hypervisor and never reaches a physical port</span><em class="qz-fb qz-good">Correct — and your ACLs and flow exporters miss it for the same reason.</em></label>
<label class="qz-opt"><input type="radio" name="vq2"><span>It is encrypted</span><em class="qz-fb qz-bad">Encryption would not stop you capturing the frames.</em></label>
<label class="qz-opt"><input type="radio" name="vq2"><span>SPAN does not support trunk ports</span><em class="qz-fb qz-bad">It does; the traffic simply is not there.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>What is the difference between a VRF and a VDC?</p>
<label class="qz-opt"><input type="radio" name="vq3"><span>A VRF separates routing tables sharing one control plane; a VDC separates processes, admins and failure domains</span><em class="qz-fb qz-good">Correct — which is why a CPU problem affects every VRF at once but not another VDC.</em></label>
<label class="qz-opt"><input type="radio" name="vq3"><span>They are the same thing on different platforms</span><em class="qz-fb qz-bad">A VDC is considerably stronger isolation.</em></label>
<label class="qz-opt"><input type="radio" name="vq3"><span>A VDC is for routing, a VRF for switching</span><em class="qz-fb qz-bad">Both apply to routing; the difference is the depth of separation.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>VMs in one VLAN work; VMs in another cannot reach anything. What do you check first?</p>
<label class="qz-opt"><input type="radio" name="vq4"><span>The allowed-VLAN list on the host's uplink trunk</span><em class="qz-fb qz-good">Correct — the single most common fault at this boundary, and it gets reported as a server problem.</em></label>
<label class="qz-opt"><input type="radio" name="vq4"><span>The hypervisor's CPU</span><em class="qz-fb qz-bad">Other VMs on the same host are fine.</em></label>
<label class="qz-opt"><input type="radio" name="vq4"><span>Spanning tree</span><em class="qz-fb qz-bad">STP would not affect one VLAN's VMs so selectively on a working trunk.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why do VSS, StackWise and vPC avoid blocked links?</p>
<label class="qz-opt"><input type="radio" name="vq5"><span>Spanning tree sees one logical switch, so there is no loop to break</span><em class="qz-fb qz-good">Correct — chassis redundancy and full bandwidth at the same time.</em></label>
<label class="qz-opt"><input type="radio" name="vq5"><span>They disable spanning tree</span><em class="qz-fb qz-bad">STP still runs; it simply sees a single device.</em></label>
<label class="qz-opt"><input type="radio" name="vq5"><span>They use routing instead of switching</span><em class="qz-fb qz-bad">The links in question are Layer 2 EtherChannels.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q6</span>Why is address-based policy weak for containers?</p>
<label class="qz-opt"><input type="radio" name="vq6"><span>Addresses are ephemeral — reassigned constantly as containers start and stop</span><em class="qz-fb qz-good">Correct, which is why container platforms and SD-Access both moved to label and group based policy.</em></label>
<label class="qz-opt"><input type="radio" name="vq6"><span>Containers do not have IP addresses</span><em class="qz-fb qz-bad">They do — just not for long.</em></label>
<label class="qz-opt"><input type="radio" name="vq6"><span>Container traffic is always encrypted</span><em class="qz-fb qz-bad">Not inherently, and encryption would not be the reason.</em></label>
</div>

---

## References

- Cisco — [Nexus VDC Configuration Guide](https://www.cisco.com/c/en/us/td/docs/switches/datacenter/sw/nx-os/virtual_device_context/configuration/guide/vdc_nx-os_cfg.html)
- Cisco — [StackWise and VSS overview](https://www.cisco.com/c/en/us/products/switches/catalyst-9000.html)
- VMware — [vSphere Networking documentation](https://docs.vmware.com/en/VMware-vSphere/index.html)
- [Docker networking overview](https://docs.docker.com/network/) · [Kubernetes networking model](https://kubernetes.io/docs/concepts/services-networking/)

---

*Related: [VRF-Lite and GRE tunnels](/blog/vrf-lite-and-gre-tunnels-explained) · [Controllers, overlays and fabrics](/blog/sdn-controllers-overlays-sd-access-and-sd-wan) · [Switching concepts and VLANs](/blog/switching-concepts-vlans-and-inter-vlan-routing).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
