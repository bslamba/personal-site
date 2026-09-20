---
title: "AI and ML in Network Operations: What It Actually Does, and What It Cannot"
excerpt: "Machine learning is pattern-finding at a scale no human can match — a baseline of 'normal' across thousands of devices, and an alert when something deviates. Generative AI drafts configs and explains errors in plain language. Neither replaces understanding the network; both change how you operate one."
date: "2026-09-22"
tags: ["AI", "Machine learning", "AIOps", "Assurance", "Automation", "CCNA"]
draft: false
---

> **Blueprint:** CCNA 200-301 — 6.4 *Explain AI (generative and predictive) and machine learning in network operations*.

## Cheat sheet

| Kind | Does | In networking |
|---|---|---|
| **Machine learning (ML)** | Learns patterns from data, no explicit rules | Baselining, anomaly detection, forecasting |
| **Predictive AI** | Estimates what will happen next | "This link/AP/disk will likely fail / saturate" |
| **Generative AI** | Produces new content from a prompt | Draft configs, explain logs/errors, summarise |
| **AIOps** | ML applied to IT operations | Correlate events, cut alert noise, find root cause |

| ML task | Question it answers |
|---|---|
| **Anomaly detection** | "Is this different from normal?" |
| **Classification** | "Which category is this?" (e.g. app recognition) |
| **Regression / forecasting** | "How much, when?" (capacity, trends) |
| **Correlation** | "Which of these 500 alerts are one incident?" |

**The sentence to keep your feet on the ground.** ML's strength is **finding patterns across more data than a human can hold at once** — a baseline of normal over thousands of devices and metrics, and a flag when reality diverges. It does not *understand* the network; it recognises shapes. So it is superb at "something changed, look here," and it still needs an engineer who knows *why* to decide what to do about it.

---

## Where it genuinely helps

<figure class="fig">
<svg class="sv1" viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Machine learning builds a baseline of normal and flags deviations that a static threshold would miss">
  <style>
    .sv1 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}
    .sv1 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}
    .sv1 .band{fill:rgba(31,157,107,.12);stroke:none}
    .sv1 .line{fill:none;stroke:#4b7bec;stroke-width:2}
    .sv1 .anom{fill:#D3002D}
  </style>
  <text class="k" x="14" y="22">"Normal" is a moving band ML learns — not a fixed threshold</text>
  <path class="band" d="M 14 90 Q 160 70 320 95 T 626 85 L 626 130 Q 320 140 160 120 T 14 135 Z"/>
  <path class="line" d="M 14 112 Q 90 100 160 118 Q 240 128 320 108 Q 400 96 470 116 L 500 60"/>
  <circle class="anom" cx="500" cy="60" r="5"/>
  <text class="s" x="470" y="48" fill="#B80027">anomaly</text>
  <text class="s" x="20" y="160">Tuesday 2am traffic that is normal on a static 80%-threshold alert but abnormal for 2am —</text>
  <text class="s" x="20" y="176">ML flags it because it learned the daily/weekly shape; a fixed threshold never would.</text>
  <rect x="14" y="192" width="612" height="24" fill="#F1EEE9" stroke="#B5B5BC"/>
  <text class="s" x="26" y="208">The value: fewer false alarms AND catching the subtle deviation a threshold misses. Both at once.</text>
</svg>
<figcaption><b>Figure 1.</b> A learned baseline adapts to time of day and day of week, so it alerts on "abnormal for this moment," not "over a number."</figcaption>
</figure>

<div class="why">
<b>Why ML beats static thresholds — and where it fails</b>
A threshold ("alert at 80% utilisation") is either too sensitive (floods you at busy times) or too lax (misses a link that is quietly abnormal for 3am). ML learns the <b>normal shape</b> — per link, per hour, per day — and alerts on <i>deviation from that</i>, which cuts false positives and catches subtle problems at once.
<br><br>Where it fails is equally important to know. ML is only as good as its <b>training data</b> — feed it a network that was already misbehaving and it learns dysfunction as "normal." It produces <b>false positives and false negatives</b>, so it advises rather than decides. And it is often a <b>black box</b> — it flags an anomaly without explaining why, which is exactly where a human who understands the network is irreplaceable. Trust it to point; do not trust it to conclude.
</div>

---

## The three kinds, concretely

<div class="walk">
<div class="walk-head">Predictive, generative, and AIOps <span class="walk-hint">click a step</span></div>
<div class="walk-tabs">
  <input type="radio" name="aiw" id="ai1" checked><label for="ai1"><span class="step-n">1</span>Predictive</label>
  <input type="radio" name="aiw" id="ai2"><label for="ai2"><span class="step-n">2</span>Generative</label>
  <input type="radio" name="aiw" id="ai3"><label for="ai3"><span class="step-n">3</span>AIOps</label>
  <input type="radio" name="aiw" id="ai4"><label for="ai4"><span class="step-n">4</span>The limits</label>
</div>
<div class="walk-panels">
<div class="walk-panel">
<svg class="sv2" viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Predictive AI forecasts failures and saturation before they happen">
  <style>.sv2 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv2 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="26">Predictive — estimate what happens next</text>
  <text class="s" x="14" y="50">"This WAN link's error rate is trending like ones that failed within a week." "This AP's client</text>
  <text class="s" x="14" y="66">count will exceed capacity by month-end." "This optic's light is degrading toward failure."</text>
  <text class="k" x="14" y="98" fill="#0f6b47">Value: fix it during a maintenance window, not at 3am when it dies.</text>
  <text class="s" x="14" y="122">It shifts operations from reactive to proactive — the single biggest operational payoff of ML.</text>
</svg>
<p class="walk-say"><span class="walk-title">Predictive AI — seeing failure coming</span>
Predictive models learn what the <b>run-up to a failure or saturation</b> looks like and flag devices on that trajectory: a link whose error rate is creeping, an AP heading for overload, an optic whose light is fading, capacity that will run out next quarter.
<br><br>The operational value is enormous and concrete: it converts <b>reactive firefighting into scheduled maintenance</b>. Replacing an optic that ML says will fail — during a window, before it does — is the difference between a planned task and a 3am outage. This is where ML most clearly earns its place in network operations.</p>
</div>
<div class="walk-panel">
<svg class="sv3" viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Generative AI drafts configuration and explains errors in plain language">
  <style>.sv3 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv3 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="26" fill="#2f5fd0">Generative — produce config, explanations, summaries</text>
  <text class="s" x="14" y="50">"Draft an OSPF config for these three routers." "What does this stack trace / crash mean?"</text>
  <text class="s" x="14" y="66">"Summarise last night's change tickets." "Turn this intent into an Ansible playbook."</text>
  <text class="k" x="14" y="98" fill="#B80027">Caveat: it is confidently wrong sometimes — you must review every line.</text>
  <text class="s" x="14" y="122">A drafting and explaining assistant, not an authority. Verify before you apply.</text>
</svg>
<p class="walk-say"><span class="walk-title">Generative AI — a drafting assistant</span>
Generative models produce new content from a prompt: a first-draft config, a plain-language explanation of a cryptic error or log, a summary of change history, a translation of intent into a playbook. Used well, it removes blank-page friction and speeds understanding.
<br><br>The caveat is non-negotiable: it is sometimes <b>confidently wrong</b> (it generates plausible text, not verified truth), so <b>every line it produces for a production device must be reviewed by someone who understands it.</b> It is a fast junior who never tires and occasionally makes things up — invaluable for a draft, never trusted unverified.</p>
</div>
<div class="walk-panel">
<svg class="sv4" viewBox="0 0 640 155" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AIOps correlates many alerts into one incident and suggests a root cause">
  <style>.sv4 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv4 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}.sv4 .m{font-family:ui-monospace,Menlo,monospace;font-size:10px;fill:#17171A}</style>
  <text class="k" x="14" y="24">AIOps — turn a flood of alerts into one incident</text>
  <text class="m" x="14" y="48" fill="#B80027">500 alerts: link down, OSPF down, BGP down, SNMP timeout, app slow…</text>
  <text class="s" x="14" y="70">↓ correlate by time, topology and dependency</text>
  <text class="m" x="14" y="92" fill="#0f6b47">1 incident: "core uplink Gi0/1 failed — everything else is a symptom"</text>
  <text class="s" x="14" y="122">Cuts alert fatigue and points at root cause, so humans spend time fixing, not triaging.</text>
  <text class="s" x="14" y="140">This is what Catalyst Center Assurance and similar platforms are doing under the hood.</text>
</svg>
<p class="walk-say"><span class="walk-title">AIOps — correlation and root cause</span>
When one failure occurs, monitoring systems emit a <b>storm of alerts</b> — the link, the protocols over it, the apps behind it, every downstream check. <b>AIOps</b> applies ML to <b>correlate</b> them by time, topology and dependency into a single incident with a probable root cause, so an engineer sees "core uplink failed" instead of 500 symptoms.
<br><br>This is what platforms like <a href="/blog/catalyst-center-and-assurance">Catalyst Center Assurance</a> do under the hood — baseline everything, correlate deviations, and surface the one thing to fix. It attacks <b>alert fatigue</b>, which is itself a major cause of missed real incidents.</p>
</div>
<div class="walk-panel">
<svg class="sv5" viewBox="0 0 640 155" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="AI limits: only as good as its data, can be a black box, and does not replace understanding">
  <style>.sv5 .s{font-family:ui-sans-serif,system-ui;font-size:10.5px;fill:#5C5C64}.sv5 .k{font-family:ui-sans-serif,system-ui;font-size:11.5px;font-weight:700}</style>
  <text class="k" x="14" y="24" fill="#B80027">What it cannot do</text>
  <text class="s" x="14" y="48">• Only as good as its training data — a sick network teaches it that sick is normal.</text>
  <text class="s" x="14" y="66">• Produces false positives and false negatives — it advises, it does not decide.</text>
  <text class="s" x="14" y="84">• Often a black box — flags "abnormal" without a reason a human can audit.</text>
  <text class="s" x="14" y="102">• Does not understand causation — it sees correlation and shape, not mechanism.</text>
  <text class="k" x="14" y="134" fill="#0f6b47">So it amplifies a skilled engineer; it does not replace one.</text>
</svg>
<p class="walk-say"><span class="walk-title">The limits — and why your skills still matter</span>
Keep four limits front of mind. ML is <b>only as good as its data</b> — train it on a misbehaving network and it normalises the dysfunction. It yields <b>false positives and negatives</b>, so it advises rather than decides. It is often a <b>black box</b> that flags without explaining. And it captures <b>correlation, not causation</b> — it sees the shape of a problem, not the mechanism.
<br><br>Which is the reassuring conclusion: AI in network operations is a <b>force multiplier for an engineer who understands the network</b>, not a replacement for one. It handles the scale — watching everything, all the time — and hands the judgement back to you. The person who knows <i>why</i> is more valuable with these tools, not less.</p>
</div>
</div>
</div>

---

## In practice

<div class="real">
<b>In the real world</b>
You are most likely to meet network ML inside a <b>product</b> rather than as something you build: <a href="/blog/catalyst-center-and-assurance">Catalyst Center Assurance</a>, Meraki, ThousandEyes, DNA/Wi-Fi analytics, and the anomaly detection in modern monitoring stacks. They baseline your environment, flag deviations, correlate alerts, and increasingly suggest a root cause. Your job is to treat those suggestions as <b>informed leads to verify</b>, not verdicts.
<br><br><b>Generative AI</b> you will use directly — to draft a config, explain an error, or scaffold an Ansible playbook. The discipline is the same as with a talented junior's work: use it to go faster, and review every line before it touches production, because it can be confidently wrong.
<br><br>The lasting point for a network engineer: these tools raise the value of <b>understanding fundamentals</b>. An anomaly flag, a correlated incident, or a generated config are only useful to someone who can judge whether they are right — which is the entire reason this study track exists.
</div>

---

## What to keep straight

**ML vs AI.** ML is the pattern-learning technique; predictive and generative AI are applications built on it. AIOps is ML applied to operations.

**Predictive vs generative.** Predictive estimates *what will happen* (failure, saturation); generative *produces content* (config, explanations).

**Correlation vs causation.** ML finds correlation and shape; it does not establish *why*. A human confirms cause.

**Advice vs decision.** It flags and suggests; you decide and act. Automating the *action* on an ML flag without review is how you get automated outages.

**Data quality.** Garbage in, confident garbage out. A model trained on a broken baseline normalises the breakage.

---

## Test yourself

<div class="qz">
<p class="qz-q"><span class="qz-num">Q1</span>What is machine learning's core strength in network operations?</p>
<label class="qz-opt"><input type="radio" name="aiq1"><span>Finding patterns across more data than a human can hold — a learned baseline of normal, and deviations from it</span><em class="qz-fb qz-good">Correct — it recognises shapes at scale; it does not understand mechanism, so it points rather than concludes.</em></label>
<label class="qz-opt"><input type="radio" name="aiq1"><span>Understanding why the network behaves as it does</span><em class="qz-fb qz-bad">It captures correlation and shape, not causation — that is where a human is needed.</em></label>
<label class="qz-opt"><input type="radio" name="aiq1"><span>Replacing engineers</span><em class="qz-fb qz-bad">It amplifies a skilled engineer; it does not replace the judgement.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q2</span>What is the difference between predictive and generative AI?</p>
<label class="qz-opt"><input type="radio" name="aiq2"><span>Predictive estimates what will happen; generative produces new content like configs or explanations</span><em class="qz-fb qz-good">Correct — forecasting a failure vs drafting a config are different applications.</em></label>
<label class="qz-opt"><input type="radio" name="aiq2"><span>They are the same thing</span><em class="qz-fb qz-bad">They solve different problems.</em></label>
<label class="qz-opt"><input type="radio" name="aiq2"><span>Predictive writes config; generative forecasts failures</span><em class="qz-fb qz-bad">Reversed.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q3</span>Why does ML beat a static utilisation threshold for alerting?</p>
<label class="qz-opt"><input type="radio" name="aiq3"><span>It learns the normal shape per time of day/week and alerts on deviation, cutting false alarms and catching subtle anomalies</span><em class="qz-fb qz-good">Correct — a fixed number is either too sensitive or too lax; a learned baseline is neither.</em></label>
<label class="qz-opt"><input type="radio" name="aiq3"><span>It never produces false positives</span><em class="qz-fb qz-bad">It does; it reduces them but does not eliminate them.</em></label>
<label class="qz-opt"><input type="radio" name="aiq3"><span>It does not need any data</span><em class="qz-fb qz-bad">It is entirely dependent on training data quality.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q4</span>What does AIOps do with an alert storm?</p>
<label class="qz-opt"><input type="radio" name="aiq4"><span>Correlates many alerts into one incident with a probable root cause</span><em class="qz-fb qz-good">Correct — it fights alert fatigue by collapsing symptoms into the underlying cause.</em></label>
<label class="qz-opt"><input type="radio" name="aiq4"><span>Silences all alerts</span><em class="qz-fb qz-bad">It correlates, it does not blanket-suppress.</em></label>
<label class="qz-opt"><input type="radio" name="aiq4"><span>Generates new configuration</span><em class="qz-fb qz-bad">That is generative AI; AIOps correlates operational events.</em></label>
</div>

<div class="qz">
<p class="qz-q"><span class="qz-num">Q5</span>Why must generative AI output for production be reviewed?</p>
<label class="qz-opt"><input type="radio" name="aiq5"><span>It generates plausible content and can be confidently wrong — it produces likely text, not verified truth</span><em class="qz-fb qz-good">Correct — treat it as a fast draft to verify, never as an authority.</em></label>
<label class="qz-opt"><input type="radio" name="aiq5"><span>It is always wrong</span><em class="qz-fb qz-bad">Often useful, but not reliably correct — hence review.</em></label>
<label class="qz-opt"><input type="radio" name="aiq5"><span>It is too slow to trust</span><em class="qz-fb qz-bad">Speed is not the issue; unverified correctness is.</em></label>
</div>

---

## References

- Cisco — [AI/ML in networking](https://www.cisco.com/site/us/en/solutions/artificial-intelligence/index.html) and [Catalyst Center Assurance](https://www.cisco.com/c/en/us/products/cloud-systems-management/dna-center/index.html).
- Cisco — [ThousandEyes](https://www.thousandeyes.com/) for AI-driven internet and path visibility.
- Background: anomaly detection, time-series forecasting, and the distinction between correlation and causation.

---

*Related: [Network automation and EEM](/blog/network-automation-orchestration-and-eem) · [Catalyst Center and Assurance](/blog/catalyst-center-and-assurance) · [Controllers, overlays and fabrics](/blog/sdn-controllers-overlays-sd-access-and-sd-wan).*

*Part of the [CCNA, ENCOR and ENARSI topic-by-topic study guide](/blog/ccna-ccnp-study-guide).*
