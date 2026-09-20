---
title: "Security Fundamentals: The Vocabulary, the Policy, and Where the Controls Go"
excerpt: "A vulnerability is the hole, a threat is who wants through it, an exploit is the method, and risk is what it costs you. Get those four straight and you can argue for the right control instead of the most impressive-sounding one — and put it at the layer where it actually helps."
date: "2026-09-21"
tags: ["Security", "Threats", "Password policy", "Defence in depth", "TrustSec", "MACsec", "CCNA", "ENCOR"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 5.1 *Define key security concepts (threats, vulnerabilities, exploits, and mitigation techniques)*, 5.2 *Describe security program elements (user awareness, training, and physical access control)*, 5.4 *Describe security password policy elements*. ENCOR 350-401 — 5.4 *Describe the components of network security design*.

## Cheat sheet

| Term | Is |
|---|---|
| **Vulnerability** | A weakness — unpatched software, a default password, an open port |
| **Threat** | Someone or something that could exploit a vulnerability |
| **Threat actor** | The specific who — criminal, insider, nation-state, opportunist |
| **Exploit** | The method or code that turns a vulnerability into an incident |
| **Risk** | **Likelihood × impact** — the only one with a number attached |
| **Mitigation** | What you do to reduce the risk |

| CIA triad | Broken by |
|---|---|
| **Confidentiality** | Sniffing, theft, over-broad access |
| **Integrity** | Tampering, man-in-the-middle |
| **Availability** | Denial of service, failure, ransomware |

| Password policy (modern, NIST 800-63B) | |
|---|---|
| **Length over complexity** | A long passphrase beats `P@ssw0rd1` |
| **No forced periodic rotation** | Rotate on evidence of compromise, not the calendar |
| **Screen against breach lists** | Blocks the passwords actually used in attacks |
| **MFA** | The single highest-value control here |

**The sentence worth arguing from.** The network is **one layer of defence, not the only one** — its distinctive value is that it sees everything, which makes it the best place to **segment** and to **detect**, and a poor place to rely on as the last line. Design assuming a layer will be bypassed, and make the next layer bound the damage.

---

## The vocabulary, precisely

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A vulnerability is a weakness, a threat wants to exploit it, an exploit is the method, and risk is likelihood times impact">
  <style>
    .sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .sv1 .b1{fill:rgba(242,201,76,.20);stroke:#c99700}
    .sv1 .b2{fill:rgba(211,0,45,.10);stroke:#D3002D}
    .sv1 .b3{fill:rgba(75,123,236,.12);stroke:#4b7bec}
    .sv1 .b4{fill:rgba(31,157,107,.12);stroke:#1f9d6b}
  </style>
  <rect class="b1" x="14" y="26" width="145" height="70"/>
  <text class="k" x="26" y="48" fill="#8a6500">Vulnerability</text>
  <text class="s" x="26" y="68">a weakness</text>
  <text class="s" x="26" y="84">(default password)</text>
  <rect class="b2" x="169" y="26" width="145" height="70"/>
  <text class="k" x="181" y="48" fill="#B80027">Threat</text>
  <text class="s" x="181" y="68">who wants in</text>
  <text class="s" x="181" y="84">(an attacker)</text>
  <rect class="b3" x="324" y="26" width="145" height="70"/>
  <text class="k" x="336" y="48" fill="#2f5fd0">Exploit</text>
  <text class="s" x="336" y="68">the method used</text>
  <text class="s" x="336" y="84">(the attack itself)</text>
  <rect class="b4" x="479" y="26" width="147" height="70"/>
  <text class="k" x="491" y="48" fill="#0f6b47">Risk</text>
  <text class="s" x="491" y="68">likelihood × impact</text>
  <text class="s" x="491" y="84">(what it costs you)</text>
  <rect x="14" y="116" width="612" height="80" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="k" x="26" y="138">Why the distinction earns its keep:</text>
  <text class="s" x="26" y="158">you cannot remove every vulnerability or every threat — but you can reduce RISK, and risk is</text>
  <text class="s" x="26" y="174">the product of the two plus impact. That is what lets you rank work: fix the vulnerability that a</text>
  <text class="s" x="26" y="190">likely threat can reach and that would hurt, before the one that is theoretically bad but unreachable.</text>
</svg>
<figcaption><b>Figure 1.</b> Four words that are constantly used loosely. Used precisely, they turn "we should be more secure" into a ranked list of work.</figcaption>
</figure>

<div class="why">
<b>Mitigation is not one thing — it is four choices</b>
For any risk you can <b>reduce</b> it (a control), <b>transfer</b> it (insurance, outsourcing), <b>accept</b> it (document it and move on, if it is small), or <b>avoid</b> it (stop doing the risky thing). Security work is deciding which, per risk, with the business — not reflexively buying a control for everything.
<br><br>The network engineer's contribution is mostly in <i>reduce</i>: segmentation, access control, encryption and detection. But knowing the other three stops you gold-plating a risk the business would happily accept, and helps you say clearly when a risk is being accepted by default because nobody chose to fund the control.
</div>

---

## Attacks, by what they break

<div class="walk">
<div class="walk-head">The categories, and the control that answers each <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="sfw" id="sf1" checked><label for="sf1"><span class="step-n">1</span>Confidentiality</label>
  <input type="radio" name="sfw" id="sf2"><label for="sf2"><span class="step-n">2</span>Integrity</label>
  <input type="radio" name="sfw" id="sf3"><label for="sf3"><span class="step-n">3</span>Availability</label>
  <input type="radio" name="sfw" id="sf4"><label for="sf4"><span class="step-n">4</span>The human</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Confidentiality attacks read data they should not, defended by encryption and access control">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="26">Attacks on confidentiality — reading what they should not</text>
  <text class="s" x="14" y="50">Sniffing on a shared segment · stealing a backup · an over-broad file share · a misconfigured</text>
  <text class="s" x="14" y="66">cloud bucket. The data was readable by someone who should not have been able to read it.</text>
  <text class="k" x="14" y="98" fill="#0f6b47">Defences: encryption in transit and at rest · least-privilege access · segmentation.</text>
  <text class="s" x="14" y="122">The network's part: segment so a sniffer sees little, and encrypt so what it sees is useless.</text>
</svg>
<p class="walk-say"><span class="walk-title">Confidentiality — keeping data unread</span>
The attacker <b>reads</b> something they should not. On a network the classic vector is capturing traffic — which is why encryption matters even inside your perimeter, and why a flat network is dangerous: one sniffing host sees far more of it.
<br><br>Answers: <b>encrypt</b> (TLS, IPsec, MACsec), enforce <b>least privilege</b> so few can reach the data at all, and <b>segment</b> so a compromised host's view is small.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Integrity attacks alter data or sit in the path, defended by authentication and signing">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="26">Attacks on integrity — changing what should not change</text>
  <text class="s" x="14" y="50">Man-in-the-middle via ARP poisoning, a rogue DHCP server or a rogue AP · tampering with data</text>
  <text class="s" x="14" y="66">in transit · spoofing a trusted source address. Both endpoints think the connection is normal.</text>
  <text class="k" x="14" y="98" fill="#0f6b47">Defences: authentication · message integrity (signing/MAC) · Layer-2 controls.</text>
  <text class="s" x="14" y="122">The network's part: DHCP snooping, DAI, 802.1X, PMF — these live below where the app can see.</text>
</svg>
<p class="walk-say"><span class="walk-title">Integrity — keeping data unaltered</span>
The attacker <b>changes</b> data, or inserts themselves into the path (man-in-the-middle) so both ends see a normal connection. The routes in are mostly Layer 2: ARP poisoning, rogue DHCP, a rogue AP, DNS spoofing.
<br><br>Answers: <b>authenticate</b> both ends, protect <b>integrity</b> cryptographically, and deploy the Layer-2 controls — <a href="/blog/layer-2-security-port-security-dhcp-snooping-and-dai">DHCP snooping, Dynamic ARP Inspection</a>, <a href="/blog/aaa-radius-tacacs-explained">802.1X</a> — that stop the insertion in the first place. This is the clearest case of the network doing something no other layer can.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Availability attacks exhaust a resource, defended by rate limiting filtering and capacity">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="26">Attacks on availability — exhausting a resource</text>
  <text class="s" x="14" y="50">Denial of service — flooding a link, a table or a CPU. Distributed (DDoS) from many sources.</text>
  <text class="s" x="14" y="66">Reflection/amplification abuses open services to bury a victim with a spoofed source address.</text>
  <text class="k" x="14" y="98" fill="#0f6b47">Defences: rate limiting · filtering · anti-spoofing (uRPF/BCP 38) · capacity and scrubbing.</text>
  <text class="s" x="14" y="122">The network's part: do not run open resolvers, and stop spoofed traffic leaving your edge.</text>
</svg>
<p class="walk-say"><span class="walk-title">Availability — keeping the service up</span>
The attacker <b>exhausts</b> something — a link, a table, a CPU. Distributed attacks come from many sources; <b>amplification</b> abuses open UDP services (DNS, NTP) to turn a small spoofed query into a large reply aimed at a victim.
<br><br>Answers: <b>rate-limit</b> and <b>filter</b>, protect the control plane, and — your responsibility to others — do not run open resolvers, and deploy <b>uRPF / BCP 38</b> so spoofed traffic cannot leave your network. See <a href="/blog/access-control-lists-wildcards-placement-ipv6-and-urpf">uRPF</a>.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 155" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Social engineering targets people and bypasses technical controls, answered by training and MFA">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="26" fill="#B80027">Social engineering — the category that actually works</text>
  <text class="s" x="14" y="50">Phishing, pretexting, tailgating. It targets a person, so no firewall or IPS is in the path —</text>
  <text class="s" x="14" y="66">the attacker logs in with valid credentials through the front door. Most incidents start here.</text>
  <text class="k" x="14" y="98" fill="#0f6b47">Defences: user awareness training · MFA · least privilege to bound a compromised account.</text>
  <text class="s" x="14" y="122">This is why training is a technical control, not a compliance box — the people are the</text>
  <text class="s" x="14" y="138">layer under attack, and MFA is what breaks the stolen-password-to-access chain.</text>
</svg>
<p class="walk-say"><span class="walk-title">The human — where it usually starts</span>
No technical control is defeated when someone is <b>persuaded</b> to hand over a credential or click a link — the attacker then acts as that user, with valid access. Phishing is the most common successful attack, full stop.
<br><br>Answers: <b>awareness training</b> (a genuine control, because the people are what is being attacked), <b>MFA</b> (breaks the stolen-password chain — prefer phishing-resistant forms), and <b>least privilege</b> so a compromised account reaches little. This is the bridge to the security-program and password-policy sections below.</p>
</div>
</div>
</div>

---

## Security program elements

Technology is a fraction of a security program. The blueprint calls out the human and physical parts because they are where the highest-value, lowest-cost wins usually are.

<div class="why">
<b>User awareness and training</b>
Since social engineering targets people, the people must be part of the defence. <b>Awareness</b> is ongoing (a phishing simulation, a reminder, a culture where reporting a mistake is safe); <b>training</b> is structured (role-specific, for example teaching developers about input validation or admins about credential hygiene). The measure that matters is not "did everyone attend" but "does reporting go up and do click-rates go down." Treat it as a control you tune, not a box you tick.
</div>

<div class="why">
<b>Physical access control</b>
Physical access is total access. Someone at the console of a switch can perform password recovery; someone who walks out with a backup drive has your data regardless of your firewalls. So the program includes <b>locks, badges, cameras, visitor escort, and secured wiring closets</b> — and on the network side, <b>port security</b> and <b>802.1X</b> so an unattended wall port is not an open door. An <code>exec-timeout</code> on the console is a physical control as much as a logical one.
</div>

---

## Password policy, as it is now

The guidance changed, and most policies have not caught up. **NIST SP 800-63B** is the reference, and the reasoning is worth carrying because you will have to argue it.

<div class="cmd">
<div class="cmd-line"><span class="opt">! what modern password policy looks like on a device</span>
<span class="t">security passwords min-length</span> <span class="opt">12</span>
<span class="t">username</span> <span class="opt">admin</span> <span class="t">privilege</span> <span class="opt">15</span> <span class="t">algorithm-type scrypt secret</span> <span class="opt">&lt;long passphrase&gt;</span>
<span class="t">enable algorithm-type scrypt secret</span> <span class="opt">&lt;different passphrase&gt;</span>
<span class="t">service password-encryption</span>
!
<span class="t">login block-for</span> <span class="opt">120</span> <span class="t">attempts</span> <span class="opt">4</span> <span class="t">within</span> <span class="opt">60</span>
<span class="t">login on-failure log</span>
<span class="t">login on-success log</span></div>
<dl class="cmd-parts">
<div class="is-key"><dt>length over complexity</dt><dd><b>A long passphrase has more entropy than a short string with symbols</b>, and people can remember it. Complexity rules produce <code>P@ssw0rd1</code> — which satisfies every rule and sits in every wordlist. Set a generous minimum length and drop the character-class gymnastics.</dd></div>
<div class="is-key"><dt>no forced rotation</dt><dd><b>Mandatory 90-day changes produce predictable patterns</b> — <code>Autumn2026!</code> then <code>Winter2027!</code>. Rotate when there is evidence of compromise, and then immediately. Scheduled rotation trains users to pick guessable sequences.</dd></div>
<div class="is-key"><dt>screen against breach lists</dt><dd><b>The control that actually works</b> — reject any password known to appear in a breach corpus, because those are precisely the ones tried in real attacks. Done at the identity provider, not the router, but it is the highest-value password rule there is.</dd></div>
<div class="is-key"><dt>algorithm-type scrypt</dt><dd>Type 9, the strongest IOS offers. Type 5 is MD5; <b>type 7 is reversible in a browser</b> — treat any type 7 secret in a config as public. <code>service password-encryption</code> only applies type 7, so it stops shoulder-surfing and nothing more.</dd></div>
<div class="is-key"><dt>login block-for</dt><dd>Four failures in a minute and the device refuses logins for two minutes — the cheapest brute-force defence IOS has, and rarely configured.</dd></div>
<div class="is-key"><dt>login on-failure log</dt><dd><b>Without it, failed logins are not recorded and an attack on your infrastructure is invisible.</b> Two words, and it is the difference between noticing and not.</dd></div>
<div><dt>and above all, MFA</dt><dd>Every rule here is mitigation for the case where MFA is absent. MFA breaks the link between a stolen password and access, which is why it is the single highest-value control in this whole article.</dd></div>
</dl>
</div>

---

## Components of network security design

ENCOR frames the defensive architecture as four building blocks. Each is a place a control lives; together they are defence in depth.

### Threat defense

**Threat defense** is the layered set of controls that detect and stop attacks in transit — **firewalls** between zones, **IPS** inspecting allowed traffic, **secure web/email gateways**, **URL and DNS filtering**, and **malware sandboxing**. The organising idea is **defence in depth**: no single control is trusted to be perfect, and the design assumes one has already been bypassed.

- **Beginner:** the stack of things that inspect traffic and block known-bad.
- **Working knowledge:** these controls are only as good as the **segmentation** behind them — a firewall between zones does nothing about traffic that never crosses a zone boundary.
- **Pro:** the highest-leverage threat-defense decision is usually **where the enforcement points sit**, not which vendor — put them where lateral movement must cross them, so east-west traffic is inspected, not just north-south. Feed everything to detection ([syslog](/blog/syslog-severities-timestamps-and-conditional-debugging), [NetFlow](/blog/netflow-flexible-netflow-templates-and-ipfix)) because you cannot stop what you cannot see.

### Endpoint security

**Endpoint security** protects the devices that originate traffic — laptops, phones, servers — because they are the largest, least trustworthy population and where most incidents begin. It combines **EDR** (endpoint detection and response), **patching**, **disk encryption**, **host firewalls**, and **posture assessment** at the network edge.

- **Beginner:** keeping the actual computers clean and patched, and checking them before they get on.
- **Working knowledge:** the network's contribution is **posture** — 802.1X with a posture check (is it patched, is EDR running) decides what VLAN and policy an endpoint gets, or quarantines it.
- **Pro:** endpoint and network security converge in **zero trust**: authenticate the endpoint, give it the minimum reachability it needs, and keep watching — because you cannot assume any endpoint is clean, only bound its reach when it is not.

### Next-generation firewall

A **next-generation firewall (NGFW)** is the modern policy enforcement point between zones. Beyond stateful 5-tuple filtering it adds **application awareness** (recognising the app regardless of port), **user identity** (rules by user/group via directory integration), **TLS inspection**, and **integrated IPS and threat intelligence**.

- **Beginner:** a firewall that understands *which application* and *which user*, not just addresses and ports.
- **Working knowledge:** identity-based rules ("Finance-group may reach the finance app") survive re-addressing in a way IP-based rules do not — the same shift as group-based policy elsewhere.
- **Pro:** an NGFW's value scales with how **segmented** the network already is; in front of a flat network it inspects north-south traffic and never sees the lateral movement that spreads a compromise. Placement and segmentation first, features second.

### TrustSec and MACsec

Two Cisco technologies that carry security **into** the network rather than only at its edges. **Cisco TrustSec** tags traffic with a **Scalable Group Tag (SGT)** at ingress and enforces policy by **group**, not IP address — so "Contractors may not reach Finance" holds wherever the endpoint is and whatever address it has. **MACsec (802.1AE)** provides **hop-by-hop Layer-2 encryption and integrity** on a wired link, so traffic is protected on the wire between switch and switch or host and switch.

- **Beginner:** TrustSec = policy by group instead of by IP; MACsec = encrypt the actual cable.
- **Working knowledge:** SGTs are propagated **inline** (in the frame) or via **SXP**, and are the policy plane of [SD-Access](/blog/sdn-controllers-overlays-sd-access-and-sd-wan); MACsec is negotiated with MKA and is line-rate in hardware.
- **Pro:** together they decouple security from topology — TrustSec makes policy independent of addressing, MACsec makes confidentiality independent of the physical path's trustworthiness. That is the direction enterprise security design has moved: identity and group at the core of policy, encryption everywhere, address-based rules retired.

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — making an attack on the device visible</div>
<pre><span class="p">R1#</span> <span class="c">show login</span>
     A login failure was detected, which caused a quiet-mode.
     Quiet-Mode access list is not configured.
 Router is in Quiet-Mode - <span class="r">will not accept any login attempts for 94 seconds</span>
     Current mode is set to QUIET.

<span class="o">! login block-for is doing its job — 4 bad tries in 60s triggered a 120s lockout.</span>

<span class="p">R1#</span> <span class="c">show logging | include LOGIN|SEC_LOGIN</span>
%SEC_LOGIN-4-LOGIN_FAILED: Login failed [user: admin] [Source: 10.9.9.9]
    [localport: 22] [Reason: Login Authentication Failed] at 14:02:11
%SEC_LOGIN-1-QUIET_MODE_ON: Still timeleft for watching failures is 94 secs,
    [user: admin] [Source: 10.9.9.9] [localport: 22] at 14:02:11

<span class="o">! WITHOUT "login on-failure log" these lines do not exist, and an attack</span>
<span class="o">! on your management plane leaves no trace at all.</span>

<span class="p">R1#</span> <span class="c">show running-config | include ^username|^enable|password-encryption</span>
enable secret 9 $9$...
username admin privilege 15 secret 9 $9$...
service password-encryption
<span class="o">! "secret 9" = scrypt, good. "password 7" anywhere = reversible, treat as public.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Detection is the control people skip and most regret.</b> None of these lines prevent an attack — but without them you cannot answer what happened, when it started, or whether it is over. Incident response without logs is guesswork, discovered at the worst possible moment.</p>

<div class="real">
<b>In the real world</b>
Two controls deliver disproportionate value: <b>MFA</b> (it breaks the phishing-to-access chain, which is how most incidents begin) and <b>segmentation</b> (it bounds what a compromise can reach, which decides how bad it gets). Everything else on this page is worth doing and none of it substitutes for those two.
<br><br>The control most often skipped is <b>logging</b> — it prevents nothing, and it is the difference between a two-hour investigation and a two-week one. Which is the honest reason to treat <a href="/blog/syslog-severities-timestamps-and-conditional-debugging">syslog</a> and <a href="/blog/netflow-flexible-netflow-templates-and-ipfix">NetFlow</a> as security tooling, not just operations tooling.
</div>

---

## What goes wrong

**Strong password policy, no MFA.** The single largest remaining gap on most networks.

**Forced 90-day rotation.** Produces `Season+Year!` and helps the attacker.

**Type 7 passwords in configs.** Reversible. Treat as plaintext and replace with `secret 9`.

**Flat network.** One compromised host reaches everything; threat-defense controls see none of it.

**No `login on-failure log`.** Attacks on the management plane are invisible.

**Address-based policy that keeps breaking.** Re-addressing invalidates it — the case for identity/group policy (TrustSec).

**Logs only on the device.** Lost on reload, and alterable by whoever got in. Send them to a collector.

---

<div class="lab">
<div class="lab-head">Lab — harden a device, then make an attack on it visible</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
This is a <b>defensive</b> lab on a device you own. Harden the management plane, turn on login logging and rate limiting, then generate <em>your own</em> failed logins and watch the device detect, log and lock — so you know what an attack on your infrastructure looks like in the logs, and can prove your controls work. No attack tooling; you test your own login.</div>

**Setup.** One lab router or switch you control, reachable over SSH. **Isolated lab only.**

<p class="lab-step"><span class="n">1</span>Baseline the exposure</p>

```cisco
R1# show running-config | include ^username|^enable|transport input|password 7
R1# show login
```

<div class="lab-watch"><b>Things to notice</b>
Look for <b>type 7</b> passwords (reversible), Telnet still allowed (<code>transport input telnet</code> or <code>all</code>), and whether <code>show login</code> reports any protection. Most default configs fail all three. Write down what you find — that is your starting risk.</div>

<p class="lab-step"><span class="n">2</span>Harden the management plane</p>

```cisco
R1(config)# username admin privilege 15 algorithm-type scrypt secret <long passphrase>
R1(config)# enable algorithm-type scrypt secret <different passphrase>
R1(config)# security passwords min-length 12
R1(config)# line vty 0 15
R1(config-line)#  transport input ssh
R1(config-line)#  access-class MGMT-ONLY in
R1(config-line)#  exec-timeout 10 0
```

<div class="lab-watch"><b>Things to notice</b>
Confirm the secrets store as <b><code>secret 9</code></b> (scrypt), not <code>5</code> or <code>7</code>. Confirm Telnet is now refused and only your management subnet can reach the vty lines. You have just closed the three most common exposures from step 1.</div>

<p class="lab-step"><span class="n">3</span>Turn on rate limiting and logging</p>

```cisco
R1(config)# login block-for 120 attempts 4 within 60
R1(config)# login on-failure log
R1(config)# login on-success log
```

<div class="lab-watch"><b>Things to notice</b>
Nothing visible yet — this only matters when something goes wrong, which is the next step. Confirm with <code>show login</code> that the failure/quiet parameters are set.</div>

<p class="lab-step"><span class="n">4</span>Trigger it yourself, then read the evidence</p>

From your own admin workstation, open an SSH session and **mistype the password four times**. Then:

```cisco
R1# show login
R1# show logging | include SEC_LOGIN
```

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>No lockout</b> — you did not exceed the threshold within the window; try four quick failures.</li>
<li><b>No log lines</b> — <code>login on-failure log</code> is missing, or logging buffer is off (<code>logging buffered</code>).</li>
<li><b>You locked yourself out</b> — wait out the 120 seconds, or use the console.</li>
</ul>
The device enters <b>quiet mode</b> and logs each failure with the <b>source address, port and timestamp</b>. <b>This is exactly what a real brute-force attempt would look like in your logs</b> — you have produced the detection signal safely, by failing your own login, so you will recognise the real thing.</div>

<p class="lab-step"><span class="n">5</span>Send the evidence somewhere it survives</p>

```cisco
R1(config)# logging host 10.0.0.50
R1(config)# service timestamps log datetime msec localtime show-timezone
```

<div class="lab-watch"><b>Things to notice</b>
Repeat step 4 and confirm the failure events now also arrive at your [syslog](/blog/syslog-severities-timestamps-and-conditional-debugging) collector. <b>On-device logs are lost on reload and alterable by whoever gets in</b> — off-box logging is what makes them evidence. This is the single most valuable step in the lab.</div>

<div class="lab-earned"><b>What you earned</b>
You have turned a default, exposed device into a hardened one: scrypt secrets, SSH-only, management-subnet-only, rate-limited. You have safely produced the exact log signature of a login attack by failing your own login, so you will recognise it in production. And you have moved that evidence off the box, which is the difference between investigating an incident and guessing at it. Every step here was defensive — hardening and detection — which is where a network engineer's security work actually lives.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is the difference between a vulnerability and a threat?</p>
<label class="qz-opt"><input type="radio" name="sfq1"><span>A vulnerability is a weakness; a threat is someone or something that could exploit it</span><em class="qz-fb qz-good">Correct — and risk is likelihood × impact, which is what lets you rank the work.</em></label>
<label class="qz-opt"><input type="radio" name="sfq1"><span>They are the same thing</span><em class="qz-fb qz-bad">They are distinct, and the distinction is what makes risk quantifiable.</em></label>
<label class="qz-opt"><input type="radio" name="sfq1"><span>A vulnerability is an attack; a threat is the damage</span><em class="qz-fb qz-bad">An attack is the exploit; the damage relates to impact.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>Which modern password guidance does NIST 800-63B give?</p>
<label class="qz-opt"><input type="radio" name="sfq2"><span>Favour length over complexity, drop forced rotation, and screen against breach lists</span><em class="qz-fb qz-good">Correct — and MFA above all of it. Complexity rules and scheduled rotation both produce guessable patterns.</em></label>
<label class="qz-opt"><input type="radio" name="sfq2"><span>Force a mix of character classes and change every 90 days</span><em class="qz-fb qz-bad">That is the old guidance the standard reversed.</em></label>
<label class="qz-opt"><input type="radio" name="sfq2"><span>Use short passwords rotated weekly</span><em class="qz-fb qz-bad">Short and frequently rotated is the worst of both.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Why is user awareness training considered a technical control?</p>
<label class="qz-opt"><input type="radio" name="sfq3"><span>Social engineering targets people, so the people are the layer being attacked</span><em class="qz-fb qz-good">Correct — phishing bypasses every device control by persuading a person, so training defends the actual target.</em></label>
<label class="qz-opt"><input type="radio" name="sfq3"><span>Because it is required for compliance</span><em class="qz-fb qz-bad">Compliance may require it, but its value is that it defends the most-attacked layer.</em></label>
<label class="qz-opt"><input type="radio" name="sfq3"><span>It replaces the need for MFA</span><em class="qz-fb qz-bad">They are complementary; MFA breaks the stolen-credential chain training cannot fully close.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>What do TrustSec and MACsec each provide?</p>
<label class="qz-opt"><input type="radio" name="sfq4"><span>TrustSec = group-based (SGT) policy independent of IP; MACsec = hop-by-hop Layer-2 encryption</span><em class="qz-fb qz-good">Correct — together they decouple policy from addressing and confidentiality from the physical path.</em></label>
<label class="qz-opt"><input type="radio" name="sfq4"><span>Both are firewalls</span><em class="qz-fb qz-bad">Neither is a firewall; one is a policy tag, one is link encryption.</em></label>
<label class="qz-opt"><input type="radio" name="sfq4"><span>TrustSec encrypts links; MACsec tags groups</span><em class="qz-fb qz-bad">Reversed — TrustSec tags groups, MACsec encrypts links.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Which two controls deliver the most value on a typical network?</p>
<label class="qz-opt"><input type="radio" name="sfq5"><span>MFA and segmentation</span><em class="qz-fb qz-good">Correct — MFA breaks the way most incidents start; segmentation bounds how far one spreads.</em></label>
<label class="qz-opt"><input type="radio" name="sfq5"><span>Password complexity rules and 90-day rotation</span><em class="qz-fb qz-bad">Both are low-value and can be counterproductive.</em></label>
<label class="qz-opt"><input type="radio" name="sfq5"><span>A bigger firewall</span><em class="qz-fb qz-bad">A firewall's value depends on segmentation behind it.</em></label>
</div>

---

## References

- **NIST SP 800-63B** — *Digital Identity Guidelines*: the modern password guidance.
- **NIST Cybersecurity Framework** — Identify, Protect, Detect, Respond, Recover.
- **CIS Critical Security Controls** — a prioritised, practical control list.
- Cisco — [TrustSec](https://www.cisco.com/c/en/us/solutions/enterprise-networks/trustsec/index.html) and [MACsec (802.1AE)](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/sec/b_173_sec_9300_cg/macsec_encryption.html)
- Cisco — [Device Hardening Guide](https://www.cisco.com/c/en/us/support/docs/ip/access-lists/13608-21.html)

---

*Related: [AAA: RADIUS and TACACS+](/blog/aaa-radius-tacacs-explained) · [Layer 2 security](/blog/layer-2-security-port-security-dhcp-snooping-and-dai) · [Access control lists and uRPF](/blog/access-control-lists-wildcards-placement-ipv6-and-urpf) · [WLAN security](/blog/wlan-security-wpa2-wpa3-and-the-four-way-handshake).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
