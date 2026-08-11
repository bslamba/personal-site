---
title: "Linux for Network and Security Engineers: The Commands That Actually Get Used"
excerpt: "A working reference for the Linux commands that matter when you're debugging a network problem — interfaces, routing, sockets, DNS, captures, certificates and logs — with the modern replacements for the tools you learned first."
date: "2026-04-16"
tags: ["Linux", "Networking", "Troubleshooting", "CLI", "Fundamentals"]
draft: false
---

## Cheat sheet

| Old command | Modern replacement | Purpose |
|---|---|---|
| `ifconfig` | `ip addr` | Interface addresses |
| `route` | `ip route` | Routing table |
| `arp` | `ip neigh` | ARP / neighbour table |
| `netstat` | `ss` | Sockets and listeners |
| `nslookup` | `dig` | DNS queries |

| Task | Command |
|---|---|
| Show addresses | `ip -br addr` |
| Show routes | `ip route` |
| Which route wins | `ip route get 8.8.8.8` |
| Listening ports | `ss -tulpn` |
| Test a TCP port | `nc -zv host 443` |
| Capture packets | `tcpdump -i eth0 -nn host 10.1.1.1` |
| DNS lookup | `dig +short example.com` |
| Full DNS trace | `dig +trace example.com` |
| Check a certificate | `openssl s_client -connect host:443` |
| Follow a log | `journalctl -f -u <service>` |
| What's using the disk | `du -sh * \| sort -h` |
| What's using CPU | `top` or `htop` |

---

Linux turns up constantly in network and security work — as the OS under an appliance, as the jump host, as the thing you SSH into to prove where a problem isn't. This is the subset that earns its place.

## Interfaces and addressing

The `ip` command replaced `ifconfig` some years ago. `ifconfig` may still exist on older builds but shows an incomplete picture on modern kernels, particularly with multiple addresses per interface.

```bash
ip addr                    # all interfaces and addresses
ip -br addr                # brief, one line per interface — the one to use
ip -4 addr                 # IPv4 only
ip link show               # layer 2 state, MAC addresses, MTU
```

`ip -br addr` is the daily driver. Colour-coded state, one line each, immediately readable.

```bash
ip addr add 10.1.1.5/24 dev eth0     # add an address
ip link set eth0 up                   # bring an interface up
ip link set eth0 mtu 9000             # set MTU
```

Changes made this way are not persistent. Depending on distribution, permanent configuration lives in NetworkManager, netplan, or `/etc/sysconfig/network-scripts`.

## Routing

```bash
ip route                        # the routing table
ip route get 8.8.8.8            # which route would actually be used
ip route add 10.2.0.0/16 via 10.1.1.1
ip route del 10.2.0.0/16
```

**`ip route get` is the underrated one.** It doesn't just show the table — it tells you the decision the kernel would make for a specific destination, including the source address it would use. When routing behaviour is confusing, this answers it directly rather than requiring you to interpret a table by hand.

**The neighbour (ARP) table:**

```bash
ip neigh                        # show
ip neigh flush all              # clear it
```

`ip neigh` shows states: `REACHABLE`, `STALE`, `FAILED`. A `FAILED` entry means ARP resolution isn't completing, which is a layer 2 problem — wrong VLAN, wrong subnet mask, or the host genuinely isn't there.

## Sockets and ports

`ss` replaced `netstat`, and it's substantially faster on busy systems.

```bash
ss -tulpn                  # TCP + UDP listening, with process names
ss -tan                    # all TCP sockets
ss -tan state established  # established connections only
ss -s                      # summary statistics
```

The flags: `-t` TCP, `-u` UDP, `-l` listening, `-p` process, `-n` numeric (don't resolve names — much faster).

**`ss -tulpn` is the command for "what is listening on this box".** It answers the question directly, with the owning process.

**To test whether a remote port is open:**

```bash
nc -zv example.com 443
timeout 3 bash -c '</dev/tcp/example.com/443' && echo open
```

The second works with no tools installed at all, which matters on a minimal container or a locked-down appliance.

## Packet capture

`tcpdump` is on almost everything, and worth being fluent in.

```bash
tcpdump -i eth0 -nn                              # everything, no name resolution
tcpdump -i eth0 -nn host 10.1.1.1                # one host
tcpdump -i eth0 -nn port 1812                    # RADIUS
tcpdump -i eth0 -nn 'host 10.1.1.1 and port 3799'  # CoA to a specific NAD
tcpdump -i eth0 -nn -w capture.pcap              # write to file for Wireshark
tcpdump -i eth0 -nn -c 100                       # stop after 100 packets
tcpdump -i eth0 -nn -s 0 -A port 80              # print payload as ASCII
```

**Always use `-nn`.** Without it, tcpdump does reverse DNS on every address, which is slow and can itself generate traffic that appears in your capture.

**`-w` then analyse in Wireshark.** Capture on the server, read on your laptop. Reading a complex capture in tcpdump's text output is possible and rarely pleasant.

**Useful filters for infrastructure work:**

```bash
tcpdump -i eth0 -nn 'udp port 67 or udp port 68'   # DHCP
tcpdump -i eth0 -nn 'port 53'                       # DNS
tcpdump -i eth0 -nn 'icmp'                          # ICMP
tcpdump -i eth0 -nn 'tcp[tcpflags] & tcp-syn != 0'  # SYNs only
tcpdump -i eth0 -nn 'ether proto 0x888e'            # EAPOL — 802.1X
```

That last one isolates 802.1X authentication traffic exactly, which is genuinely useful when debugging a supplicant.

## DNS

```bash
dig example.com
dig +short example.com
dig example.com MX
dig @8.8.8.8 example.com          # query a specific resolver
dig +trace example.com            # walk the delegation from the root
dig -x 93.184.216.34              # reverse lookup
```

**`dig +trace`** performs the full iterative resolution and shows each referral. When resolution fails and you don't know where, this identifies the exact step.

Use `dig`, not `nslookup`. `nslookup` is deprecated and gives less information.

## Certificates

The command set that comes up constantly in NAC and web work.

```bash
# What is this server presenting?
openssl s_client -connect example.com:443 -servername example.com

# The full chain — for diagnosing missing intermediates
openssl s_client -connect example.com:443 -showcerts

# Dates, subject, issuer, in one line
echo | openssl s_client -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -dates -subject -issuer

# Inspect a certificate file
openssl x509 -in cert.pem -noout -text

# Check a private key matches a certificate
openssl x509 -noout -modulus -in cert.pem | openssl md5
openssl rsa -noout -modulus -in key.pem | openssl md5

# Test a specific TLS version
openssl s_client -connect example.com:443 -tls1_2
```

**The modulus comparison** is the fastest way to confirm a certificate and key belong together. Two identical hashes means they match; different means you have the wrong pair, which is a common cause of a service that won't start.

**`-showcerts`** is the one for the classic "works on some clients, fails on others" symptom — a missing intermediate certificate. Clients that have cached the intermediate succeed; clients that haven't, fail.

## Logs

```bash
journalctl -f                       # follow everything
journalctl -u sshd -f               # follow one service
journalctl -u sshd --since "1 hour ago"
journalctl -p err --since today     # errors only
journalctl -b                       # since last boot
```

On systems without systemd, or for application logs:

```bash
tail -f /var/log/messages
tail -f /var/log/secure                    # auth events on RHEL
tail -f /var/log/auth.log                  # auth events on Debian
grep -i error /var/log/app.log
grep -c "Failed password" /var/log/auth.log
```

**`journalctl -p err --since today`** is a good first command on an unfamiliar box that's misbehaving.

## Resources

```bash
top                     # processes by CPU
htop                    # nicer, if installed
free -h                 # memory
df -h                   # disk usage by filesystem
du -sh * | sort -h      # what's consuming this directory
iostat -x 1             # disk I/O
uptime                  # load average
```

**`du -sh * | sort -h`** run from `/` and then descending is the fastest way to find what filled a disk. Full disks are behind a remarkable proportion of "the application stopped working" incidents.

**Load average** in `uptime` shows 1, 5 and 15 minute figures. Compare against core count — a load of 4 on a 16-core machine is fine; on a 2-core machine it isn't.

## Files and text

```bash
grep -r "pattern" /etc/              # recursive search
grep -i -n "error" file.log          # case-insensitive, with line numbers
grep -A5 -B5 "error" file.log        # context around matches
awk '{print $1}' file.log | sort | uniq -c | sort -rn   # count by first field
sed -i 's/old/new/g' file.txt        # in-place replace
find / -name "*.conf" -mtime -1      # config files changed in last day
```

**That `awk` pipeline is worth memorising.** Extract a field, sort, count occurrences, sort by count descending. It answers "which IP is generating the most requests" or "which error appears most often" in one line.

**`find / -mtime -1`** answers "what changed recently" when something broke and nobody admits to changing anything.

## Firewall

```bash
# firewalld — RHEL/CentOS
firewall-cmd --list-all
firewall-cmd --add-port=1812/udp --permanent
firewall-cmd --reload

# nftables — modern
nft list ruleset

# iptables — still widespread
iptables -L -n -v
iptables -t nat -L -n -v
```

**`iptables -L -n -v`** with the packet counters is the useful form. A rule with zero packets is a rule that isn't being hit, which tells you the traffic isn't arriving or an earlier rule matched first.

## A first-response sequence

For a Linux box that "isn't working", in order:

```bash
uptime                   # load, and how long since reboot
df -h                    # is a disk full?
free -h                  # is memory exhausted?
ip -br addr              # does it have the addresses it should?
ip route                 # does it have a default route?
ss -tulpn                # is the service actually listening?
journalctl -p err --since today   # what has it complained about?
```

Seven commands, under a minute, and they eliminate the majority of causes. Full disk and exhausted memory in particular account for a surprising share of failures that get investigated as application problems first.

---

The value of knowing these isn't Linux administration — it's being able to prove where a problem is rather than arguing about it. `ss -tulpn` on the server and `nc -zv` from the client settles "is it the firewall or the application" in ten seconds, and that's the sort of question that otherwise consumes an afternoon.
