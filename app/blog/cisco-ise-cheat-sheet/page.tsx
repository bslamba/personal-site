// app/blog/cisco-ise-cheat-sheet/page.tsx
import React from 'react';
import { Network, Shield, Server, Activity, Lock, Key } from 'lucide-react';

export const metadata = {
  title: 'Cisco ISE Ultimate Cheat Sheet | Features, Flows & Config',
  description: 'A hyper-dense, single-page cheat sheet for Cisco ISE 802.1X, MAB, Posture, and TrustSec.',
};

export default function ISECheatSheet() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-2 md:p-4 font-mono">
      {/* Header */}
      <header className="mb-4 pb-2 border-b border-gray-300 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CISCO ISE: UNIFIED CHEAT SHEET</h1>
          <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">RADIUS · TACACS+ · CoA · TrustSec · Posture</p>
        </div>
        <button className="text-xs bg-black text-white px-3 py-1 rounded hover:bg-gray-800 hidden md:block" onClick={() => window.print()}>
          Print / PDF
        </button>
      </header>

      {/* Dense Masonry Layout for Cards */}
      <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
        
        {/* 802.1X CARD */}
        <div className="break-inside-avoid bg-white border border-gray-300 rounded shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2 border-b pb-1">
            <Lock size={14} className="text-blue-600" />
            <h2 className="font-bold text-sm uppercase">802.1X (Dot1x)</h2>
          </div>
          <div className="text-xs space-y-2">
            <p><strong>Flow:</strong> Supplicant ↔ Authenticator ↔ Auth Server (ISE)</p>
            <ol className="list-decimal pl-4 space-y-1 text-gray-700">
              <li><strong>EAPOL-Start:</strong> Supplicant initiates (optional).</li>
              <li><strong>EAP-Request/Identity:</strong> Switch requests ID.</li>
              <li><strong>EAP-Response/Identity:</strong> Supplicant sends ID.</li>
              <li><strong>RADIUS Access-Request:</strong> Switch wraps EAP in RADIUS, sends to ISE.</li>
              <li><strong>Access-Challenge:</strong> ISE requests credential proof (PEAP/EAP-TLS).</li>
              <li><strong>Access-Accept/Reject:</strong> ISE sends final decision + dACL/VLAN.</li>
            </ol>
            <div className="bg-gray-100 p-1.5 rounded text-[10px] overflow-x-auto border border-gray-200">
              <code>
                aaa new-model<br/>
                dot1x system-auth-control<br/>
                int g1/0/1<br/>
                &nbsp;authentication port-control auto<br/>
                &nbsp;dot1x pae authenticator
              </code>
            </div>
          </div>
        </div>

        {/* MAB CARD */}
        <div className="break-inside-avoid bg-white border border-gray-300 rounded shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2 border-b pb-1">
            <Network size={14} className="text-green-600" />
            <h2 className="font-bold text-sm uppercase">MAB (MAC Auth Bypass)</h2>
          </div>
          <div className="text-xs space-y-2">
            <p><strong>Use Case:</strong> Printers, cameras, legacy devices.</p>
            <ol className="list-decimal pl-4 space-y-1 text-gray-700">
              <li>Switch detects link up & learns MAC address.</li>
              <li>Switch waits for EAPOL (if dot1x is primary). If timeout, triggers MAB.</li>
              <li><strong>RADIUS Access-Request:</strong> Sent to ISE. Calling-Station-ID = MAC.</li>
              <li>ISE checks internal/external Endpoints database.</li>
            </ol>
            <div className="bg-gray-100 p-1.5 rounded text-[10px] overflow-x-auto border border-gray-200">
              <code>
                int g1/0/2<br/>
                &nbsp;mab<br/>
                &nbsp;authentication order dot1x mab<br/>
                &nbsp;authentication priority dot1x mab
              </code>
            </div>
          </div>
        </div>

        {/* PROFILING CARD */}
        <div className="break-inside-avoid bg-white border border-gray-300 rounded shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2 border-b pb-1">
            <Activity size={14} className="text-purple-600" />
            <h2 className="font-bold text-sm uppercase">Profiling Probes</h2>
          </div>
          <div className="text-xs space-y-2 text-gray-700">
            <p><strong>Goal:</strong> Dynamically identify endpoint OS and hardware.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>DHCP:</strong> Parses Options (55, 60) for OS fingerprinting. IP Helper needed.</li>
              <li><strong>HTTP:</strong> Parses User-Agent strings via SPAN/URL redirect.</li>
              <li><strong>RADIUS:</strong> Extracts attributes from Access-Request (Framed-IP, Calling-Station-ID).</li>
              <li><strong>SNMP:</strong> Queries NAD for MAC/IP tables (CDP/LLDP info).</li>
              <li><strong>NMAP:</strong> Active subnet scanning (heavy weight, use sparingly).</li>
              <li><strong>Device Sensor:</strong> NAD sends CDP/LLDP/DHCP data inside RADIUS Accounting.</li>
            </ul>
          </div>
        </div>

        {/* POSTURE CARD */}
        <div className="break-inside-avoid bg-white border border-gray-300 rounded shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2 border-b pb-1">
            <Shield size={14} className="text-red-600" />
            <h2 className="font-bold text-sm uppercase">Posture Assessment</h2>
          </div>
          <div className="text-xs space-y-2 text-gray-700">
            <p><strong>States:</strong> Unknown, Compliant, Non-Compliant.</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li><strong>Initial Auth:</strong> Device authenticates, Posture status is Unknown.</li>
              <li><strong>Redirect:</strong> ISE sends redirect-URL and dACL limiting access to ISE/DNS/DHCP.</li>
              <li><strong>Discovery:</strong> AnyConnect/Secure Client probes for ISE (port 8905).</li>
              <li><strong>Assessment:</strong> Agent checks AV, OS patch, registry, sends report.</li>
              <li><strong>CoA (Reauth):</strong> ISE sends RADIUS CoA to switch. Switch re-authenticates endpoint, applies full-access dACL.</li>
            </ol>
          </div>
        </div>

        {/* CHANGE OF AUTHORIZATION (CoA) */}
        <div className="break-inside-avoid bg-white border border-gray-300 rounded shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2 border-b pb-1">
            <Server size={14} className="text-orange-600" />
            <h2 className="font-bold text-sm uppercase">RADIUS CoA (RFC 5176)</h2>
          </div>
          <div className="text-xs space-y-2 text-gray-700">
            <p><strong>Port:</strong> UDP 1700 (Cisco standard).</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Reauth:</strong> Forces NAD to re-run authentication (keeps port UP). Used post-profiling/posture.</li>
              <li><strong>Port Bounce:</strong> Flashes link state (Down/Up). Forces endpoint to request new DHCP IP. (Required if VLAN changes).</li>
              <li><strong>Session Terminate:</strong> Disconnects user completely.</li>
            </ul>
            <div className="bg-gray-100 p-1.5 rounded text-[10px] overflow-x-auto border border-gray-200">
              <code>
                aaa server radius dynamic-author<br/>
                &nbsp;client 10.0.0.5 server-key Cisco123
              </code>
            </div>
          </div>
        </div>

        {/* TRUSTSEC CARD */}
        <div className="break-inside-avoid bg-white border border-gray-300 rounded shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2 border-b pb-1">
            <Lock size={14} className="text-indigo-600" />
            <h2 className="font-bold text-sm uppercase">TrustSec (SGT)</h2>
          </div>
          <div className="text-xs space-y-2 text-gray-700">
            <p><strong>Concept:</strong> Tagging packets with Security Group Tags instead of relying on IP-based ACLs.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Inline Tagging:</strong> CMD (Cisco Meta Data) header inserted into Layer 2 frame. Native to hardware.</li>
              <li><strong>SXP (SGT Exchange Protocol):</strong> TCP port 64999. Used to pass IP-to-SGT bindings over legacy networks that don't support inline hardware tagging.</li>
              <li><strong>SGACL:</strong> Policies enforced at the destination egress point based on Source SGT vs Destination SGT.</li>
            </ul>
          </div>
        </div>

        {/* TACACS+ CARD */}
        <div className="break-inside-avoid bg-white border border-gray-300 rounded shadow-sm p-3">
          <div className="flex items-center gap-2 mb-2 border-b pb-1">
            <Key size={14} className="text-yellow-600" />
            <h2 className="font-bold text-sm uppercase">TACACS+ (Device Admin)</h2>
          </div>
          <div className="text-xs space-y-2 text-gray-700">
            <p><strong>Protocol:</strong> TCP Port 49. Entire payload encrypted (unlike RADIUS).</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Authentication:</strong> Who is the admin?</li>
              <li><strong>Authorization:</strong> Evaluates every single command typed (e.g., `show run`) against ISE Command Sets.</li>
              <li><strong>Accounting:</strong> Logs every accepted/rejected command to ISE reports.</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}

