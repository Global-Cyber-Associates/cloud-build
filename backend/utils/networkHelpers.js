// utils/networkHelpers.js
export function isRouterIP(ip, hostname = "", vendor = "") {
  if (!ip) return false;

  const lowerHost = hostname.toLowerCase();
  const lowerVendor = vendor.toLowerCase();

  // 🧩 Common static router IPs
  const knownRouterIPs = [
    "192.168.0.1", "192.168.1.1", "192.168.1.254",
    "10.0.0.1", "10.1.1.1", "172.16.0.1",
  ];

  // 🧠 Hotspot / gateway patterns (common in mobile + shared networks)
  const routerPatterns = [
    ".0.1", ".1.1", ".254", ".1.254", ".0.254",
    ".43.1",  // Android tether
    ".137.1", // Windows hotspot
    ".2.1",   // macOS Internet Sharing
    ".10.1",  // iPhone hotspot
    ".248.1", // Jio / Airtel / VI routers
    ".225.1", // Jio 4G routers
    ".42.129" // MediaTek chipsets
  ];

  // 1️⃣ Direct match
  if (knownRouterIPs.includes(ip)) return true;

  // 2️⃣ Pattern match
  if (routerPatterns.some(p => ip.endsWith(p))) return true;

  // 3️⃣ Vendor / hostname hint match
  if (/(router|gateway|modem|fiber|broadband|dlink|tplink|netgear|asus|wifi)/i.test(lowerHost)) return true;
  if (/(router|gateway|modem|fiber|broadband|access point)/i.test(lowerVendor)) return true;

  return false;
}
