---
title: "Troubleshooting Device Management: Getting In, and Getting Files On and Off"
excerpt: "When you cannot reach a device, the fault is almost always in a small, well-defined set: the line config, the transport, the ACL in front of the VTYs, or the transfer protocol. Here is how console, VTY, and each access and file-transfer method fails — and how to tell which one you are looking at."
date: "2026-09-22"
tags: ["Device management", "SSH", "SCP", "VTY", "Troubleshooting", "TFTP", "ENARSI"]
draft: false
---

> **Blueprint:** ENARSI 300-410 — 4.1 *Troubleshoot device management*.

## Cheat sheet

| Access method | Port | Note |
|---|---|---|
| **Console** | physical | Always works locally; the recovery path when all else fails |
| **VTY (SSH)** | TCP 22 | The normal remote path; needs RSA key + `transport input ssh` |
| **Telnet** | TCP 23 | Plaintext — disable it (`transport input ssh`) |
| **HTTP / HTTPS** | 80 / 443 | Web UI / RESTCONF; `ip http secure-server` |
| **SCP** | TCP 22 | Encrypted file copy over SSH — `ip scp server enable` |
| **(T)FTP** | UDP 69 / TCP 21 | TFTP tiny, no auth; FTP plaintext creds |

| Symptom | Look at |
|---|---|
| SSH refused | RSA key, `ip ssh version 2`, `transport input`, `login` method |
| Connects then rejected | AAA/local auth, `login authentication`, `aaa authorization exec` |
| Reachable from here, not there | `access-class` on the VTY lines, or a path ACL |
| File copy dies partway | **flash space** — `dir` first — not the network |

**The sentence that saves the session.** Before you touch anything, open a **second session** and keep the **console** in reach — most device-management faults are one config line away from locking you out, and the console is the escape hatch that does not depend on the thing you are changing.

---

## The access path, and where it breaks

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A remote login passes through reachability, the VTY access-class, the transport setting, and authentication, any of which can fail">
  <style>
    .sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10px;fill:#5C5C64}
    .sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11px;font-weight:700}
    .sv1 .b{fill:#F1EEE9;stroke:#B5B5BC}
    .sv1 .m{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;fill:#17171A}
  </style>
  <rect class="b" x="14" y="40" width="108" height="40"/><text class="k" x="68" y="58" text-anchor="middle">1 Reach</text><text class="s" x="68" y="73" text-anchor="middle">route + ARP</text>
  <rect class="b" x="140" y="40" width="108" height="40"/><text class="k" x="194" y="58" text-anchor="middle">2 access-class</text><text class="s" x="194" y="73" text-anchor="middle">VTY ACL</text>
  <rect class="b" x="266" y="40" width="108" height="40"/><text class="k" x="320" y="58" text-anchor="middle">3 transport</text><text class="s" x="320" y="73" text-anchor="middle">ssh allowed?</text>
  <rect class="b" x="392" y="40" width="108" height="40"/><text class="k" x="446" y="58" text-anchor="middle">4 authn</text><text class="s" x="446" y="73" text-anchor="middle">login method</text>
  <rect class="b" x="518" y="40" width="108" height="40"/><text class="k" x="572" y="58" text-anchor="middle">5 authz</text><text class="s" x="572" y="73" text-anchor="middle">exec shell</text>
  <line x1="122" y1="60" x2="140" y2="60" stroke="#8A8A93"/><line x1="248" y1="60" x2="266" y2="60" stroke="#8A8A93"/><line x1="374" y1="60" x2="392" y2="60" stroke="#8A8A93"/><line x1="500" y1="60" x2="518" y2="60" stroke="#8A8A93"/>
  <text class="s" x="14" y="108">Each stage fails differently — and the symptom tells you which stage:</text>
  <text class="m" x="14" y="130">1 fails → connection times out (no route/ARP)         2 fails → connection refused/reset by access-class</text>
  <text class="m" x="14" y="148">3 fails → "connection refused" (ssh not in transport)  4 fails → prompted, then "% Authentication failed"</text>
  <text class="m" x="14" y="166">5 fails → authenticated, then dropped with no exec (missing aaa authorization exec)</text>
  <rect x="14" y="182" width="612" height="24" fill="rgba(31,157,107,.10)" stroke="#1f9d6b"/>
  <text class="s" x="26" y="198">Work the stages in order — the point of failure narrows the fault to one config area.</text>
</svg>
<figcaption><b>Figure 1.</b> Five stages, five distinct symptoms. Identify the stage and you have identified the config to fix.</figcaption>
</figure>

<div class="why">
<b>The order matters because each stage's symptom is different</b>
"I can't get in" is not one problem. If it <b>times out</b>, you never reached the device — a routing or ARP issue, stage 1. If it is <b>refused/reset immediately</b>, an <code>access-class</code> ACL on the VTY lines rejected your source, or <code>transport input</code> does not allow SSH — stages 2–3. If you get a <b>password prompt then failure</b>, it is authentication — stages 4. If you <b>authenticate then get dropped with no prompt</b>, it is authorization — the missing <code>aaa authorization exec</code>, stage 5. Reading which symptom you have skips most of the guessing.
</div>

---

## The methods, one by one

### Console and VTY

The **console** is the physical port; it always works locally and is the recovery path when remote access is broken — which is why you never make a risky management change without it in reach. The **VTY** lines are the virtual terminals for remote sessions (SSH), and their configuration is where most remote-access faults live.

- **Beginner:** console = the cable; VTY = the remote SSH sessions.
- **Working knowledge:** on the VTY lines, three things decide access — `transport input` (which protocols are allowed), `access-class` (which source addresses may connect), and `login`/`login authentication` (how you are authenticated). `exec-timeout` closes idle sessions. There are a limited number of VTY lines (often 0–4 or 0–15); if they are all held by stale sessions, new logins are refused — `show users` and `clear line` fix it.
- **Pro:** the commonest self-lockout is an `access-class` referencing an ACL that does not permit your subnet (an empty or mistyped ACL denies everything), or `transport input none`. Both are recoverable only from the console — which is the whole reason for the second-session rule.

### Telnet, HTTP, HTTPS, SSH, SCP

These are the remote **access and management transports**, and the rule is simple: **use the encrypted ones, disable the rest.**

- **SSH (TCP 22)** — the standard for CLI. Needs a hostname, a domain name, an **RSA key** (`crypto key generate rsa modulus 2048`), `ip ssh version 2`, and `transport input ssh` on the VTYs. The classic breakage: renaming the device *after* generating the key, so the key no longer matches — regenerate it.
- **Telnet (TCP 23)** — plaintext, credentials in clear. Disable with `transport input ssh`; configuring SSH does **not** remove Telnet on its own.
- **HTTPS (TCP 443)** — the web UI and **RESTCONF**; `ip http secure-server`. **HTTP (80)** is its plaintext form — `no ip http server`.
- **SCP (TCP 22)** — encrypted file copy riding on SSH; `ip scp server enable`. The right way to move images and configs.

- **Beginner:** SSH to manage, SCP to copy files, and turn Telnet/HTTP off.
- **Pro:** all of SSH, HTTPS and SCP depend on SSH/TLS being healthy — one broken RSA key or an expired/mismatched certificate breaks all three at once. If SSH, the web UI and SCP fail together, suspect the key/cert, not each service.

### (T)FTP

**TFTP (UDP 69)** and **FTP (TCP 21)** are the legacy file-transfer methods, still present because they are simple. **TFTP** has no authentication, no directory listing, no resume, and often a ~32 MB limit — but it is tiny enough to run in **ROMMON**, which is why it survives as the image-recovery tool when a device has no working OS. **FTP** adds authentication but sends **credentials in clear** and uses a two-connection model that fights firewalls.

- **Beginner:** old, simple ways to copy files to/from a device; prefer SCP for anything real.
- **Working knowledge:** TFTP failures are usually **reachability or the server** (it is UDP, so no helpful error) — confirm the file exists and is readable, and that no firewall blocks UDP 69. `ip tftp source-interface` pins the source so the server's ACL sees the expected address.
- **Pro:** the transfer that **dies partway through** is almost never the protocol — it is **flash space**. `dir flash:` before any image copy; a 900 MB image failing at 60% on a nearly-full filesystem looks like a network fault and is not. See [static routes, DHCP relay and file transfer](/blog/static-routes-dhcp-relay-and-file-transfer) for the transfer methods in depth.

---

## Reading it

<div class="term">
<div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span>R1 — locating a management fault by stage</div>
<pre><span class="p">R1#</span> <span class="c">show ip ssh</span>
SSH Enabled - version 2.0
<span class="o">! "SSH Disabled" or version 1.99 → RSA key missing/too small, or version not set.</span>

<span class="p">R1#</span> <span class="c">show run | section line vty</span>
line vty 0 4
 access-class MGMT-ONLY in
 transport input ssh
 login authentication default
<span class="o">! transport input ssh → Telnet off (good). access-class → check the ACL permits you.</span>

<span class="p">R1#</span> <span class="c">show ip access-lists MGMT-ONLY</span>
Standard IP access list MGMT-ONLY
    10 permit 10.0.0.0, wildcard bits 0.0.0.255
<span class="o">! If your source is not in 10.0.0.0/24, the implicit deny refuses you — connection reset.</span>

<span class="p">R1#</span> <span class="c">show users</span>
    Line       User       Host(s)              Idle
*  0 con 0                idle                 00:00:00
 194 vty 0     admin      idle                 00:11:04
<span class="o">! All VTYs busy with stale sessions? New logins refused. "clear line vty N" frees one.</span>

<span class="p">R1#</span> <span class="c">debug ip ssh</span>
SSH2 CLIENT 10.0.0.9: SSH2_MSG_KEXINIT sent
<span class="r">SSH2 1: Session disconnected - error 0x00</span>
<span class="o">! Key exchange failing → RSA key problem (regenerate after any hostname/domain change).</span>

<span class="p">R1#</span> <span class="c">dir flash: | include free</span>
   <span class="r">18923520 bytes free</span> (of 256 MB)
<span class="o">! 18 MB free and a 200 MB image to copy → the copy WILL fail partway. Not the network.</span><span class="cur"></span></pre>
</div>
<p class="term-cap"><b>Match the symptom to the stage.</b> Times out → reachability. Refused/reset → `access-class` or `transport`. Prompt then fail → authentication. Authenticated then dropped → authorization. Copy dies partway → flash space. Each points at one command, which is why device-management troubleshooting is fast once you read the symptom correctly.</p>

<div class="real">
<b>In the real world</b>
The overwhelming majority of "I'm locked out" incidents are self-inflicted and recoverable from the console: an `access-class` ACL that does not include the jump host, `transport input` set wrong, an RSA key invalidated by a rename, or all VTY lines held by stale sessions. The habit that prevents every one of them is the same — <b>a second session open and the console reachable</b> before you change anything on the management plane.
<br><br>For file transfer, the single most common time-waster is diagnosing a "network problem" that is a <b>full filesystem</b>. Run <code>dir</code> first, every time. And keep <b>TFTP</b> in your toolkit specifically for the day a device drops to ROMMON with no image — it is the one transfer method that works when nothing else on the box does.
</div>

---

## What goes wrong

**SSH refused / disabled.** No RSA key, key too small, `ip ssh version 2` missing, or SSH not in `transport input`.

**SSH broke after a rename.** The RSA key is tied to `hostname.domain`. Regenerate it.

**Connect then "Authentication failed".** Wrong credentials, or a broken `login authentication` method list pointing at an unreachable AAA server with no `local` fallback.

**Authenticated, then dropped with no prompt.** Missing `aaa authorization exec` — the AAA gotcha.

**Reachable from one host, not another.** `access-class` on the VTYs, or a path ACL, does not permit the second source.

**New logins refused, existing ones fine.** All VTY lines occupied by stale sessions. `show users`, `clear line`.

**File copy fails partway.** Flash space. `dir` first — not the network.

**TFTP silently fails.** UDP, so no error — check the server, the file, reachability, and `ip tftp source-interface`.

---

<div class="lab">
<div class="lab-head">Lab — break management access five ways, and recognise each</div>
<div class="lab-body">

<div class="lab-target"><b>Target</b>
Produce each stage's failure deliberately on a device you own, so you learn to read the symptom and go straight to the config. Console stays connected throughout — this lab is about locking yourself out safely and getting back in.</div>

**Setup.** A lab router/switch with **console access kept open the whole time**, plus a management host over SSH. Isolated lab only.

<p class="lab-step"><span class="n">1</span>Baseline working SSH</p>

Confirm SSH works from the management host: RSA key present, `ip ssh version 2`, `transport input ssh`, a working `login`. Keep this session and the console both open.

<div class="lab-watch"><b>Things to notice</b>
`show ip ssh`, `show run | section line vty`, and `show users`. Know what healthy looks like before you break it — that is the reference for every step below.</div>

<p class="lab-step"><span class="n">2</span>Break the transport (stage 3)</p>

Set `transport input none` on the VTY lines. From the management host, try to SSH in.

<div class="lab-watch"><b>Things to notice</b>
<b>Connection refused</b>, immediately — no password prompt. That instant refusal (versus a timeout) is the signature of a transport/access-class problem, not a reachability or auth one. Fix from the console with `transport input ssh`.</div>

<p class="lab-step"><span class="n">3</span>Break the access-class (stage 2)</p>

Apply `access-class` referencing an ACL that does **not** include your source (or an empty ACL). Try again.

<div class="lab-issues"><b>Possible issues</b>
<ul>
<li><b>You still get in</b> — the ACL permits your source; make it deny you (or leave it empty, which denies all).</li>
<li><b>You locked out the console too</b> — you applied it to <code>line con</code>; it belongs on <code>line vty</code>.</li>
</ul>
Connection <b>reset/refused</b> again, but this time the cause is the ACL's implicit deny. This is the single most common real lockout — an <code>access-class</code> that forgot the jump host. Recover from the console; note you could <i>only</i> recover from the console.</div>

<p class="lab-step"><span class="n">4</span>Break authentication vs authorization (stages 4–5)</p>

First, point `login authentication` at an AAA method with no reachable server and **no `local` fallback**. Then, separately, restore auth but remove `aaa authorization exec`.

<div class="lab-watch"><b>Things to notice</b>
No fallback → you are <b>prompted then rejected</b> (stage 4). Missing authorization → you <b>authenticate, then the session drops with no exec prompt</b> (stage 5). Two different symptoms, two different fixes — and the reason [AAA method lists](/blog/aaa-radius-tacacs-explained) always end in `local`.</div>

<p class="lab-step"><span class="n">5</span>Break SSH by renaming, and break a file copy</p>

Change the device `hostname`, then try SSH. Separately, fill flash (or pick a device with little free space) and attempt to copy a large file.

<div class="lab-watch"><b>Things to notice</b>
After the rename, SSH fails at <b>key exchange</b> (`debug ip ssh`) because the RSA key no longer matches the new `hostname.domain` — regenerate it. The file copy <b>dies partway</b> with a space error; <code>dir flash:</code> shows why. <b>Neither is a network fault</b>, and recognising that is the point of the step.</div>

<div class="lab-earned"><b>What you earned</b>
You have produced all five stages of management-access failure and seen that each has a distinct symptom — timeout, refusal, prompt-then-fail, authenticate-then-drop, copy-dies-partway — so "I'm locked out" becomes a specific, fast diagnosis. You recovered each from the console, proving why the second-session rule is non-negotiable. And you saw two "network problems" that were a stale RSA key and a full filesystem, which is where much device-management troubleshooting time is really lost.</div>

</div>
</div>

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>An SSH attempt is refused immediately with no password prompt. Which stages are suspect?</p>
<label class="qz-opt"><input type="radio" name="dmq1"><span>The VTY <code>access-class</code> or <code>transport input</code> — you reached the device but the line rejected you</span><em class="qz-fb qz-good">Correct — immediate refusal (not a timeout, not a prompt) points at the line's ACL or allowed transports.</em></label>
<label class="qz-opt"><input type="radio" name="dmq1"><span>Authentication credentials</span><em class="qz-fb qz-bad">That would give you a prompt first, then a failure.</em></label>
<label class="qz-opt"><input type="radio" name="dmq1"><span>Routing to the device</span><em class="qz-fb qz-bad">A reachability problem times out; it does not refuse.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>You authenticate successfully but the session drops with no exec prompt. Cause?</p>
<label class="qz-opt"><input type="radio" name="dmq2"><span>Missing <code>aaa authorization exec</code> — authenticated but not authorized for a shell</span><em class="qz-fb qz-good">Correct — the classic AAA gotcha, a distinct symptom from an auth failure.</em></label>
<label class="qz-opt"><input type="radio" name="dmq2"><span>Wrong password</span><em class="qz-fb qz-bad">That fails at the prompt, before you authenticate.</em></label>
<label class="qz-opt"><input type="radio" name="dmq2"><span>SSH version mismatch</span><em class="qz-fb qz-bad">That would prevent the session establishing at all.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>SSH stops working right after you rename the device. Why?</p>
<label class="qz-opt"><input type="radio" name="dmq3"><span>The RSA key is tied to hostname.domain and no longer matches — regenerate it</span><em class="qz-fb qz-good">Correct — key exchange fails; regenerate the key after any hostname/domain change.</em></label>
<label class="qz-opt"><input type="radio" name="dmq3"><span>Renaming disables SSH</span><em class="qz-fb qz-bad">It invalidates the key, which breaks SSH — not a direct disable.</em></label>
<label class="qz-opt"><input type="radio" name="dmq3"><span>The VTY lines reset</span><em class="qz-fb qz-bad">Line config is unaffected by a rename; the key is the issue.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>A large image copy fails partway through. Most likely cause?</p>
<label class="qz-opt"><input type="radio" name="dmq4"><span>Insufficient flash space — check <code>dir</code> first; it is not the network</span><em class="qz-fb qz-good">Correct — the commonest "network" file-transfer fault that is actually a full filesystem.</em></label>
<label class="qz-opt"><input type="radio" name="dmq4"><span>SSH key mismatch</span><em class="qz-fb qz-bad">That would stop the transfer from starting, not fail it partway.</em></label>
<label class="qz-opt"><input type="radio" name="dmq4"><span>Wrong VTY transport</span><em class="qz-fb qz-bad">Transport affects logins, not an in-progress file copy.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why does TFTP survive despite SCP being better?</p>
<label class="qz-opt"><input type="radio" name="dmq5"><span>It is small enough to run in ROMMON, so it works when the device has no OS</span><em class="qz-fb qz-good">Correct — the image-recovery case is its real justification; use SCP for everything else.</em></label>
<label class="qz-opt"><input type="radio" name="dmq5"><span>It is encrypted</span><em class="qz-fb qz-bad">It has no security at all — no auth, no encryption.</em></label>
<label class="qz-opt"><input type="radio" name="dmq5"><span>It is faster than SCP</span><em class="qz-fb qz-bad">Its lockstep acknowledgement makes it slow over latency.</em></label>
</div>

---

## References

- Cisco — [Secure Shell (SSH) Configuration](https://www.cisco.com/c/en/us/support/docs/security-vpn/secure-shell-ssh/4145-ssh.html)
- Cisco — [Configuring SCP](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_usr_ssh/configuration/xe-17/sec-usr-ssh-xe-17-book.html)
- Cisco — [Password Recovery Procedures](https://www.cisco.com/c/en/us/support/docs/ios-nx-os-software/ios-software-releases-121-mainline/6130-index.html) (the console recovery path).

---

*Related: [AAA: RADIUS and TACACS+](/blog/aaa-radius-tacacs-explained) · [Static routes, DHCP relay and file transfer](/blog/static-routes-dhcp-relay-and-file-transfer) · [Security fundamentals](/blog/security-fundamentals-threats-policy-and-network-design) · [Syslog](/blog/syslog-severities-timestamps-and-conditional-debugging).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
