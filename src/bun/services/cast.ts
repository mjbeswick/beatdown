import dgram from 'dgram';
import * as os from 'os';
import type { DLNADevice } from '../../shared/types';

export type { DLNADevice };

// ── SSDP discovery ────────────────────────────────────────────────────────────

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;

const M_SEARCH = [
  'M-SEARCH * HTTP/1.1',
  `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
  'MAN: "ssdp:discover"',
  'MX: 3',
  'ST: urn:schemas-upnp-org:service:AVTransport:1',
  '',
  '',
].join('\r\n');

export function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

export async function discoverDevices(timeoutMs = 4000): Promise<DLNADevice[]> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const locations = new Set<string>();
    let done = false;

    const finish = async () => {
      if (done) return;
      done = true;
      try { socket.close(); } catch {}
      clearTimeout(timer);
      const results = await Promise.allSettled([...locations].map(fetchDevice));
      const devices: DLNADevice[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) devices.push(r.value);
      }
      resolve(devices);
    };

    const timer = setTimeout(finish, timeoutMs);

    socket.on('message', (msg) => {
      const text = msg.toString();
      const locMatch = text.match(/^LOCATION:\s*(.+)$/im);
      if (locMatch) locations.add(locMatch[1].trim());
    });

    socket.on('error', () => finish());

    socket.bind(0, () => {
      const buf = Buffer.from(M_SEARCH);
      socket.send(buf, 0, buf.length, SSDP_PORT, SSDP_ADDR);
    });
  });
}

async function fetchDevice(location: string): Promise<DLNADevice | null> {
  try {
    const res = await fetch(location, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const xml = await res.text();

    const nameMatch = xml.match(/<friendlyName>([^<]+)<\/friendlyName>/);
    const udnMatch = xml.match(/<UDN>([^<]+)<\/UDN>/);
    if (!nameMatch || !udnMatch) return null;

    // Find the AVTransport service block and extract its controlURL
    const avMatch = xml.match(
      /urn:schemas-upnp-org:service:AVTransport:1[\s\S]*?<\/service>/
    );
    if (!avMatch) return null;
    const ctrlMatch = avMatch[0].match(/<controlURL>([^<]+)<\/controlURL>/);
    if (!ctrlMatch) return null;

    const base = new URL(location);
    const ctrlPath = ctrlMatch[1];
    const controlUrl = new URL(
      ctrlPath.startsWith('/') ? ctrlPath : '/' + ctrlPath,
      base.origin
    ).toString();

    return {
      id: udnMatch[1],
      name: nameMatch[1],
      host: base.hostname,
      controlUrl,
    };
  } catch {
    return null;
  }
}

// ── SOAP helpers ──────────────────────────────────────────────────────────────

async function soapRequest(controlUrl: string, action: string, body: string): Promise<void> {
  const envelope = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>${body}</s:Body>
</s:Envelope>`;

  const res = await fetch(controlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPAction: `"urn:schemas-upnp-org:service:AVTransport:1#${action}"`,
    },
    body: envelope,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SOAP ${action} failed: ${res.status} ${text}`);
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Cast controls ─────────────────────────────────────────────────────────────

export async function castTrack(
  device: DLNADevice,
  streamUrl: string,
  title: string,
  artist: string
): Promise<void> {
  const metadata = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>${escapeXml(title)}</dc:title><dc:creator>${escapeXml(artist)}</dc:creator><upnp:class>object.item.audioItem.musicTrack</upnp:class><res>${escapeXml(streamUrl)}</res></item></DIDL-Lite>`;

  await soapRequest(
    device.controlUrl,
    'SetAVTransportURI',
    `<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CurrentURI>${escapeXml(streamUrl)}</CurrentURI><CurrentURIMetaData>${escapeXml(metadata)}</CurrentURIMetaData></u:SetAVTransportURI>`
  );
  await soapRequest(
    device.controlUrl,
    'Play',
    `<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Speed>1</Speed></u:Play>`
  );
}

export async function pauseCast(device: DLNADevice): Promise<void> {
  await soapRequest(
    device.controlUrl,
    'Pause',
    `<u:Pause xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Pause>`
  );
}

export async function resumeCast(device: DLNADevice): Promise<void> {
  await soapRequest(
    device.controlUrl,
    'Play',
    `<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Speed>1</Speed></u:Play>`
  );
}

export async function seekCast(device: DLNADevice, seconds: number): Promise<void> {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const target = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  await soapRequest(
    device.controlUrl,
    'Seek',
    `<u:Seek xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>${target}</Target></u:Seek>`
  );
}

export async function stopCast(device: DLNADevice): Promise<void> {
  await soapRequest(
    device.controlUrl,
    'Stop',
    `<u:Stop xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Stop>`
  );
}
