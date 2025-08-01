import tlds from "./tlds.json" assert { type: "json" };

const tldMap: Record<string, string | boolean> = {
  ...(tlds as any).popular,
  ...(tlds as any).gTLDs,
  ...(tlds as any).ccTLDs,
  ...(tlds as any).SLDs,
};
import { DomainStatus } from "./types.js";
import { parse } from "tldts";

export function validateDomain(domain: string): DomainStatus {
  const parsed = parse(domain.toLowerCase());
  if (
    !parsed.domain ||
    !parsed.publicSuffix ||
    domain.trim() !== parsed.domain
  ) {
    return {
      domain,
      availability: "invalid",
      resolver: "validator",
      raw: { validator: null },
      error: new Error(
        `Parse error: input: ${domain}, parsedName: ${parsed.domain}, tld: ${parsed.publicSuffix}`
      ),
    };
  }

  if (!parsed.isIcann) {
    return {
      domain,
      availability: "unsupported",
      resolver: "validator",
      raw: { validator: null },
      error: new Error(`TLD is not ICANN supported`),
    };
  }

  const suffix = parsed.publicSuffix;
  const val = tldMap[suffix];
  if (!val) {
    return {
      domain,
      availability: "unsupported",
      resolver: "validator",
      raw: { validator: null },
      error: Error(`The library does not support the tld .${suffix}`),
    };
  }

  return {
    domain,
    availability: "unknown",
    resolver: "validator",
    raw: { validator: null },
  };
}
