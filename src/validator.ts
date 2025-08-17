import tlds from "./tlds.json" assert { type: "json" };

const tldMap: Record<string, string | boolean> = {
  ...(tlds as any).popular,
  ...(tlds as any).gTLDs,
  ...(tlds as any).ccTLDs,
  ...(tlds as any).SLDs,
};
import { DomainStatus, ParsedDomain } from "./types.js";

export function validateDomain(parsed: ParsedDomain, originalDomain: string): DomainStatus {
  if (
    !parsed.domain ||
    !parsed.publicSuffix ||
    parsed.hostname !== parsed.domain
  ) {
    return {
      domain: parsed.hostname || "",
      availability: "invalid",
      resolver: "validator",
      raw: { validator: null },
      error: new Error(
        `Parse error: originalDomain: ${originalDomain}, parsedName: ${parsed.domain}, tld: ${parsed.publicSuffix}`
      ),
    };
  }

  const domain = parsed.domain;

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
