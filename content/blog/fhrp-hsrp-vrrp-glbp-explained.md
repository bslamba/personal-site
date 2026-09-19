---
title: "First Hop Redundancy: HSRP, VRRP and GLBP, and the Default Gateway That Cannot Fail"
excerpt: "A PC has one default gateway and no way to find another. When that router dies the subnet is isolated, however much redundancy sits behind it. FHRP solves it by making two routers share one IP and one MAC — and the details of how they share it decide whether your failover takes one second or thirty."
date: "2026-09-20"
tags: ["HSRP", "VRRP", "GLBP", "FHRP", "Routing", "High Availability", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 3.5 *Describe the purpose, functions, and concepts of first hop redundancy protocols*. ENCOR 350-401 — 1.1.b *High availability techniques such as redundancy, FHRP, and SSO*, 3.3.c *Configure first hop redundancy protocols, such as HSRP, VRRP*.

## Cheat sheet

| | HSRP | VRRP | GLBP |
|---|---|---|---|
| **Origin** | Cisco | **Open** — RFC 5798 | Cisco |
| **Multicast** | v1 `224.0.0.2` · v2 `224.0.0.102` | `224.0.0.18` | `224.0.0.102` |
| **Transport** | UDP 1985 | **IP protocol 112** | UDP 3222 |
| **Virtual MAC** | v1 `0000.0C07.ACxx` · v2 `0000.0C9F.Fxxx` | `0000.5E00.01xx` | `0007.B400.xxyy` |
| **Roles** | Active / Standby | Master / Backup | AVG / AVF |
| **Priority** | 100 default, **higher wins** | 100 default, **255 = address owner** | 100 default |
| **Preempt** | **Off** by default | **On** by default | On by default |
| **Timers** | Hello 3s, Hold 10s | Advertise 1s, Master down ~3.6s | Hello 3s, Hold 10s |
| **Groups** | 0–255 (v1), 0–4095 (v2) | 1–255 | 0–1023 |
| **Load sharing** | Multiple groups, manually | Multiple groups, manually | **Built in** — one group, many forwarders |

**The one that catches people:** HSRP preempt is off, VRRP preempt is on. Restore a failed HSRP router and it comes back as *standby* unless you told it otherwise.

---

## The problem is on the host, not the router

Everything a network engineer builds for redundancy — two distribution switches, two uplinks, a routing protocol that reconverges in milliseconds — stops at the edge of the PC.

A host has exactly **one default gateway**. It is a single IP address, learned from DHCP or typed in, and the host has no mechanism to discover that it has stopped working. There is no protocol running on a laptop that says "my gateway is dead, let me find another one." The host will keep ARPing for a router that is not there, and every packet destined off-subnet will be dropped, until somebody fixes it or DHCP renews.

<figure class="fig">
<svg viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A host with a single default gateway is isolated when that router fails, despite a second router being present">
  <style>
    .n{fill:#17171A}.dead{fill:#D3002D}.alive{fill:#1f9d6b}
    .nt{fill:#FAF8F5;font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .l{stroke:#8A8A93;stroke-width:1.5}
    .dx{stroke:#D3002D;stroke-width:2.5}
    .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700;fill:#D3002D}
  </style>
  <rect class="n" x="24" y="90" width="90" height="34" rx="3"/><text class="nt" x="69" y="112" text-anchor="middle">PC</text>
  <text class="s" x="69" y="142" text-anchor="middle">gateway 10.1.1.1</text>
  <text class="s" x="69" y="156" text-anchor="middle">and nothing else</text>
  <line class="l" x1="114" y1="107" x2="200" y2="107"/>
  <rect class="n" x="200" y="90" width="80" height="34" rx="3"/><text class="nt" x="240" y="112" text-anchor="middle">SW</text>
  <line class="l" x1="280" y1="100" x2="380" y2="56"/>
  <line class="l" x1="280" y1="114" x2="380" y2="158"/>
  <rect class="dead" x="380" y="38" width="130" height="34" rx="3"/>
  <text class="nt" x="445" y="60" text-anchor="middle">R1  10.1.1.1</text>
  <line class="dx" x1="392" y1="40" x2="498" y2="70"/><line class="dx" x1="498" y1="40" x2="392" y2="70"/>
  <rect class="alive" x="380" y="140" width="130" height="34" rx="3"/>
  <text class="nt" x="445" y="162" text-anchor="middle">R2  10.1.1.2</text>
  <text class="s" x="556" y="60">dead</text>
  <text class="s" x="556" y="162">healthy —</text>
  <text class="s" x="556" y="175">and unused</text>
  <text class="k" x="320" y="196" text-anchor="middle">the PC has no way to learn that .2 exists</text>
</svg>
<figcaption><b>Figure 1.</b> R2 is fine. The subnet is still down, because nothing tells the host to use it.</figcaption>
</figure>

<div class="why">
<b>The trick FHRP plays</b>
Rather than teaching hosts about redundancy, FHRP <em>lies to them</em>. Two routers agree to share a third, made-up IP address and — crucially — a made-up MAC address. The host ARPs for the gateway and gets the virtual MAC back. When the active router fails, the standby starts answering for that same virtual MAC and sends a gratuitous ARP to move the switches' MAC tables. The host's ARP cache never changes, because from its point of view nothing happened. It is still talking to the same MAC address; a different box is simply answering to it now.
</div>

That last point is why the **virtual MAC matters more than the virtual IP**. If failover only moved the IP, every host would have to re-ARP, and their caches can hold the old entry for four hours. Moving the MAC means the host needs to do nothing at all.

---

## HSRP

Cisco's, and still the most deployed. Two routers, one group, one virtual IP.

### The states

`Initial → Learn → Listen → Speak → Standby → Active`

| State | Meaning |
|---|---|
| **Initial** | Not started. Interface down, or HSRP just configured. |
| **Learn** | Does not yet know the virtual IP — waiting to hear it from the active router. Only seen when the virtual IP was not configured locally. |
| **Listen** | Knows the virtual IP, is neither active nor standby. This is where a third router sits, permanently. |
| **Speak** | Sending hellos, contesting the election. |
| **Standby** | The designated backup. Exactly one. Watches the active router. |
| **Active** | Forwarding for the virtual IP and MAC. Exactly one. |

Only the **active** and **standby** routers send hellos. A third router in a group sits in `Listen` and says nothing, which is why HSRP does not degrade with more routers — it just never uses them.

### Configuration

```cisco
interface Vlan10
 ip address 10.1.10.2 255.255.255.0
 standby version 2
 standby 10 ip 10.1.10.1
 standby 10 priority 110
 standby 10 preempt delay minimum 60
 standby 10 authentication md5 key-string 7 <secret>
 standby 10 timers msec 250 msec 750
 standby 10 track 1 decrement 20
!
track 1 interface GigabitEthernet0/1 line-protocol
```

Line by line, because every one of these matters:

**`standby version 2`** — use it. Version 1 caps groups at 255, uses a virtual MAC with only 8 bits of group, and cannot do millisecond timers or IPv6. Version 2 fixes all of that. **Both routers must run the same version** or they will not see each other and you will get two active routers.

**`standby 10 ip 10.1.10.1`** — the virtual IP. It is in the subnet but assigned to no interface. Configure the same address on both routers.

**`standby 10 priority 110`** — higher wins. Default 100. Leave both at default and the election falls to the highest interface IP, which is not a decision you made.

**`standby 10 preempt`** — **without this, priority only matters once.** The first router up becomes active and keeps the role even when a higher-priority router appears. This is the single most common HSRP misconfiguration.

**`delay minimum 60`** — and this is why preempt alone is not enough. A router that has just rebooted has HSRP up in seconds but its routing protocol has not converged. Without the delay it seizes the active role and blackholes traffic for as long as OSPF takes to settle. Sixty seconds is a sane floor; match it to your IGP.

**`timers msec 250 msec 750`** — hello 250 ms, hold 750 ms. Default 3/10 means up to **ten seconds** of outage. Sub-second is normal on modern hardware. Do not go below 250 ms without knowing your CPU headroom.

### Tracking — the part that makes it actually work

A router whose uplink has failed is still perfectly healthy on the LAN side. It will keep sending HSRP hellos, keep being active, and keep accepting traffic it cannot forward anywhere. Tracking fixes that by lowering priority when something it depends on goes away.

```cisco
track 1 interface GigabitEthernet0/1 line-protocol
track 2 ip route 0.0.0.0/0 reachability
!
interface Vlan10
 standby 10 track 1 decrement 20
 standby 10 track 2 decrement 30
```

Priority 110, minus 20 when the uplink drops, gives 90 — below the peer's 100, so with preempt configured on the peer the role moves. **The decrement must be large enough to cross the other router's priority.** Decrementing 5 from 110 leaves 105, still the winner, and nothing happens. This is a very common and very quiet failure.

Tracking a route (`track 2`) is stronger than tracking an interface: the uplink can be up while the far end is broken.

### Reading it

```text
R1# show standby brief
                     P indicates configured to preempt.
                     |
Interface   Grp  Pri P State    Active          Standby         Virtual IP
Vl10        10   110 P Active   local           10.1.10.3       10.1.10.1
Vl20        20   100 P Standby  10.1.10.3       local           10.1.20.1
```

Read the **P** column first — if it is blank, preempt is off and your priorities are decorative. Here VLAN 10 is active on this router and VLAN 20 on the peer, which is the correct pattern: split the groups so both routers forward.

---

## VRRP

The open standard. RFC 5798 for version 3, which supports IPv4 and IPv6.

Functionally almost identical to HSRP, with four differences that matter:

**Preempt is on by default.** The opposite of HSRP. A returning higher-priority router takes back the master role automatically.

**Priority 255 means address owner.** If the virtual IP is *the same as* a real interface address on a router, that router is the owner and has priority 255 permanently. It always wins. This is the standard's model and has no HSRP equivalent.

**It runs on IP protocol 112**, not UDP. Some firewalls and ACLs that permit "UDP" will drop it.

**Terminology:** master and backup, not active and standby.

```cisco
interface Vlan10
 ip address 10.1.10.2 255.255.255.0
 vrrp 10 ip 10.1.10.1
 vrrp 10 priority 110
 vrrp 10 timers advertise 1
 vrrp 10 authentication md5 key-string <secret>
```

Choose VRRP when the subnet has non-Cisco routers on it. Choose HSRP when everything is Cisco and you want the tracking and delay options, which are richer.

---

## GLBP

HSRP and VRRP both waste half your capacity. One router forwards, the other watches. You can split groups across VLANs to balance, but within a single VLAN one router does all the work.

GLBP solves it inside one group. The **Active Virtual Gateway (AVG)** answers every ARP for the virtual IP — but hands out a *different virtual MAC* to different hosts, round robin. Each MAC belongs to an **Active Virtual Forwarder (AVF)**, and up to four routers can forward simultaneously for the same virtual IP.

```cisco
interface Vlan10
 ip address 10.1.10.2 255.255.255.0
 glbp 10 ip 10.1.10.1
 glbp 10 priority 110
 glbp 10 preempt
 glbp 10 load-balancing host-dependent
 glbp 10 weighting 100 lower 80 upper 95
 glbp 10 weighting track 1 decrement 25
```

Load balancing modes: `round-robin` (default), `host-dependent` (a given host always gets the same MAC — important for stateful firewalls), `weighted` (proportional to capacity).

<div class="note">
<b>Why you rarely see GLBP any more</b>
It is Cisco proprietary, and the problem it solves has largely been solved better elsewhere — by a Layer 2 multi-chassis technology (vPC, VSS, StackWise Virtual) that makes two physical switches look like one, so a single HSRP instance is active on what is logically one device and both chassis forward. If your distribution layer is a VSS or StackWise Virtual pair, GLBP buys you nothing. It is still on the blueprint, and still worth knowing the mechanism.
</div>

---

## What goes wrong

**Two active routers.** Both think they are alone. Causes, in order of likelihood: HSRP version mismatch (v1 and v2 do not interoperate), the VLAN not actually trunked between them, authentication configured on one side, or an ACL blocking the multicast.

**Failover does not happen when the uplink fails.** No tracking configured, or the decrement is too small to cross the peer's priority.

**Failover happens but traffic still blackholes for a minute.** The new active router's routing protocol has not converged. That is `preempt delay minimum`.

**The router comes back and does not resume.** HSRP preempt is off by default. Add it.

**Failover takes ten seconds.** Default timers. Set `msec` values.

**Everything looks right but hosts still fail.** Check the switch MAC table for the virtual MAC (`show mac address-table address 0000.0c9f.f00a`). If it points at the old router, the gratuitous ARP did not take — usually a port security or DAI interaction.

---

<div class="lab">
<div class="lab-head">Lab — HSRP with tracking, and every way it fails</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Build a redundant default gateway for VLAN 10 across two routers, prove failover works for a router failure <em>and</em> for an uplink failure, measure how long each takes, and then deliberately reproduce the four classic misconfigurations so you recognise them from the symptom alone.</div>

**Topology.** R1 and R2 both on VLAN 10 via a switch. A PC on VLAN 10. Each router has an uplink to R3, which represents the core. R1 = 10.1.10.2, R2 = 10.1.10.3, virtual IP 10.1.10.1. PC's gateway is 10.1.10.1.

<p class="lab-step"><span class="n">1</span>Baseline HSRP</p>

```cisco
! R1
interface Vlan10
 ip address 10.1.10.2 255.255.255.0
 standby version 2
 standby 10 ip 10.1.10.1
 standby 10 priority 110
 standby 10 preempt

! R2 — identical but priority 100 (default, so omitted)
interface Vlan10
 ip address 10.1.10.3 255.255.255.0
 standby version 2
 standby 10 ip 10.1.10.1
 standby 10 preempt
```

Verify with `show standby brief` on both. R1 Active, R2 Standby, **P** shown on both.

<p class="lab-step"><span class="n">2</span>Find the virtual MAC, and watch it move</p>

On the PC: `arp -a` and note the MAC for 10.1.10.1. It should start `0000.0C9F.F0` with the group number at the end. On the switch: `show mac address-table address <that MAC>` — note which port it is learned on.

Start a continuous ping from the PC to something beyond R3. Now `shutdown` R1's VLAN 10 interface. Count lost pings. Re-run the switch MAC table command and confirm the port changed. Re-run `arp -a` on the PC and confirm **the MAC did not change**.

<div class="lab-watch"><b>Things to notice</b>
The PC's ARP entry is identical before and after. That is the entire mechanism — the host never learned anything. Also note the default timers cost you roughly ten seconds of ping loss, which is far too long for voice or any TCP session with a short timeout.</div>

<p class="lab-step"><span class="n">3</span>Make it sub-second</p>

```cisco
! Both routers
interface Vlan10
 standby 10 timers msec 250 msec 750
```

Repeat the failover. Count lost pings again. Record both numbers — this comparison is the justification you will give someone for changing timers in production.

<p class="lab-step"><span class="n">4</span>Track the uplink</p>

```cisco
! R1
track 1 interface GigabitEthernet0/1 line-protocol
interface Vlan10
 standby 10 track 1 decrement 20
```

With pings running, `shutdown` R1's **uplink** (not the VLAN interface). R1 is still alive on the LAN but cannot reach the core.

<div class="lab-watch"><b>Things to notice</b>
Without tracking, this is the worst failure mode there is: R1 stays Active, keeps answering ARP, and silently discards everything. The ping stops and HSRP looks perfectly healthy in <code>show standby</code>. With tracking, priority drops 110 → 90 and the role moves. Confirm the new priority with <code>show standby Vlan10</code>.</div>

<p class="lab-step"><span class="n">5</span>Break it four ways, on purpose</p>

Do each, record the symptom, then undo it.

1. **Remove `preempt` from R1.** Reload R1. It comes back Standby despite priority 110. Symptom: the P column is blank and the wrong router is Active.
2. **Set the decrement to 5** instead of 20. Fail the uplink. Nothing happens — 110 − 5 = 105, still above R2's 100. Symptom: tracking is configured, shows as Down, and the role does not move.
3. **Set R2 to `standby version 1`.** Symptom: both routers go Active. Check `show standby` on each — neither sees a peer.
4. **Add `standby 10 authentication md5 key-string CISCO` on R1 only.** Symptom: two Active routers again, and `debug standby errors` reports the authentication failure.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>Both routers Active from the start</b> — the VLAN is not actually carried between them. Check <code>show interfaces trunk</code> before blaming HSRP.</li>
<li><b>The virtual IP does not ping</b> — normal from the routers themselves in some IOS versions. Test from the PC.</li>
<li><b>Tracking shows Up when the interface is down</b> — you tracked <code>line-protocol</code> on the wrong interface, or the interface is a subinterface whose parent is still up.</li>
<li><b>Sub-second timers cause flapping</b> — the CPU cannot keep up, common on virtual routers in EVE-NG. Back off to 500/1500 ms in a simulator.</li>
<li><b>Ping loss is zero even when you expect some</b> — your ping interval is longer than the failover. Use <code>ping ... timeout 0 repeat 10000</code> or a rapid ping from a real host.</li>
</ul></div>

<p class="lab-step"><span class="n">6</span>Add the convergence delay</p>

```cisco
interface Vlan10
 standby 10 preempt delay minimum 60
```

Reload R1 with pings running. Without the delay, traffic breaks for as long as the IGP takes to converge after R1 seizes the role back. With it, R1 waits. Time both.

<p class="lab-step"><span class="n">7</span>Do it again with VRRP</p>

Replace the HSRP configuration with VRRP. Note three things: you did **not** configure preempt and it still preempts; the virtual MAC now starts `0000.5E00.01`; and an ACL permitting only UDP would break it, because VRRP is IP protocol 112.

<p class="lab-step"><span class="n">8</span>Capture the hellos</p>

Mirror the switch port facing R1 to a machine running Wireshark. Filter `hsrp` (then `vrrp`). Open one hello and find: the group number, the priority, the state, the virtual IP, and the hello and hold timers. Watch the priority field change live when you fail the tracked uplink.

<div class="lab-earned"><b>What you earned</b>
You can now explain why a host never notices a gateway failure, and point at the virtual MAC as the reason. You can size timers against a measured outage rather than guessing. You know that HSRP without <code>preempt</code> ignores your priorities, that tracking without a large enough decrement does nothing at all, and that a version mismatch and an authentication mismatch produce the identical symptom of two Active routers — so you will check both. And you have seen the failure mode that matters most in production: a router that is perfectly healthy on the LAN, still Active, and blackholing everything.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>R1 has HSRP priority 110, R2 has 100. R2 boots first. Who is Active, and why?</p>
<label class="qz-opt"><input type="radio" name="fh1"><span>R1 — it has the higher priority</span><em class="qz-fb qz-bad">Only if preempt is configured. Priority alone does not displace a router that is already Active.</em></label>
<label class="qz-opt"><input type="radio" name="fh1"><span>R2 — it was there first, unless R1 has preempt configured</span><em class="qz-fb qz-good">Correct, and this is the commonest HSRP mistake. Preempt is off by default in HSRP — but on by default in VRRP.</em></label>
<label class="qz-opt"><input type="radio" name="fh1"><span>Both — they will each become Active</span><em class="qz-fb qz-bad">That happens on a version or authentication mismatch, not from boot order.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>R1 is Active with priority 110 and tracks its uplink with <code>decrement 5</code>. R2 is 100. The uplink fails. What happens?</p>
<label class="qz-opt"><input type="radio" name="fh2"><span>Nothing — 110 − 5 = 105, still higher than R2</span><em class="qz-fb qz-good">Exactly. Tracking is configured and shows Down, but the decrement never crosses the peer's priority. Traffic blackholes while everything looks healthy.</em></label>
<label class="qz-opt"><input type="radio" name="fh2"><span>R2 becomes Active immediately</span><em class="qz-fb qz-bad">Only if the decrement brings R1 below 100.</em></label>
<label class="qz-opt"><input type="radio" name="fh2"><span>Both become Active</span><em class="qz-fb qz-bad">Tracking does not split the group.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>After failover, why does the host not need to re-ARP?</p>
<label class="qz-opt"><input type="radio" name="fh3"><span>Because the standby router takes over the same virtual MAC</span><em class="qz-fb qz-good">Right. The IP and the MAC both move, so the host's ARP cache stays valid. A gratuitous ARP updates the switches' MAC tables, not the host's cache.</em></label>
<label class="qz-opt"><input type="radio" name="fh3"><span>Because the host re-runs DHCP</span><em class="qz-fb qz-bad">Nothing triggers DHCP here, and it would be far too slow.</em></label>
<label class="qz-opt"><input type="radio" name="fh3"><span>Because HSRP sends the host a redirect</span><em class="qz-fb qz-bad">There is no host-facing signalling in HSRP at all — that is the point of the design.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>An ACL permits UDP 1985 and your FHRP still fails. Which protocol is it?</p>
<label class="qz-opt"><input type="radio" name="fh4"><span>HSRP — the port is wrong</span><em class="qz-fb qz-bad">UDP 1985 is exactly HSRP's port.</em></label>
<label class="qz-opt"><input type="radio" name="fh4"><span>VRRP — it runs on IP protocol 112, not UDP at all</span><em class="qz-fb qz-good">Correct, and a classic firewall problem. VRRP is not UDP, so a UDP permit does nothing for it.</em></label>
<label class="qz-opt"><input type="radio" name="fh4"><span>GLBP — it uses UDP 3222</span><em class="qz-fb qz-bad">True that GLBP uses 3222, but the question describes something UDP rules cannot fix.</em></label>
</div>

---

## References

- **RFC 5798** — Virtual Router Redundancy Protocol (VRRP) Version 3 for IPv4 and IPv6.
- **RFC 2281** — Cisco Hot Standby Router Protocol (HSRP). Informational.
- Cisco — [HSRP Configuration Guide](https://www.cisco.com/c/en/us/support/docs/ip/hot-standby-router-protocol-hsrp/9234-hsrpguidetoc.html)
- Cisco — [Understanding and Troubleshooting HSRP Problems](https://www.cisco.com/c/en/us/support/docs/ip/hot-standby-router-protocol-hsrp/10583-62.html)
- Cisco — [GLBP Overview](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/ipapp_fhrp/configuration/xe-16/fhp-xe-16-book/fhp-glbp.html)

---

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
