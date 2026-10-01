// Finding Home Assistant on the local network: HA announces itself through zeroconf
// (`_home-assistant._tcp`) with its name, version and URLs in the TXT record. Over a VPN the
// announcement usually doesn't arrive; the address can still be typed in.
import { Bonjour, type Service } from "bonjour-service";

export type FoundHa = {
    /** The instance's name ("Home"). */
    name: string;
    url: string;
    version?: string;
};

const SEARCH_MS = 3000;

/** Search for `ms` and return what answered, each instance once. */
export function findHomeAssistants(ms = SEARCH_MS): Promise<FoundHa[]> {
    return new Promise((done) => {
        const bonjour = new Bonjour();
        const found = new Map<string, FoundHa>();
        bonjour.find({ type: "home-assistant" }, (s: Service) => {
            const ha = fromService(s);
            if (ha) found.set(ha.url, ha);
        });
        setTimeout(() => {
            bonjour.destroy();
            done([...found.values()]);
        }, ms);
    });
}

function fromService(s: Service): FoundHa | undefined {
    const txt = (s.txt ?? {}) as Record<string, string | undefined>;
    const ipv4 = s.addresses?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
    const url = txt.internal_url || txt.base_url || (ipv4 ? `http://${ipv4}:${s.port}` : undefined);
    if (!url) return undefined;
    return { name: txt.location_name || s.name, url: url.replace(/\/+$/, ""), version: txt.version };
}
