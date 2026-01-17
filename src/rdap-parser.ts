

type JCardProperty = [string, Record<string, any>, string, string | number];
type JCard = ["vcard", JCardProperty[]];

interface RdapLink {
  value?: string;
  rel?: string;
  href?: string;
  type?: string;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}

interface RdapPublicId {
  type: string;
  identifier: string;
}

interface RdapEntity {
  objectClassName?: string;
  handle?: string;
  roles?: string[];
  vcardArray?: JCard;
  entities?: RdapEntity[]; // Nested entities (e.g. abuse inside registrar)
  publicIds?: RdapPublicId[];
  links?: RdapLink[];
}

interface RdapNameserver {
  ldhName?: string;
}

interface RdapData {
  rdap?: RdapData; // Handle wrapped structures
  ldhName?: string;
  status?: string[];
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  [key: string]: any; // Allow other properties
}

type Whois = {
  domainInfo: {
    domainName: string;
    registeredDate: string;
    expiryDate: string;
    lastUpdate: string;
    status: string[];
    nameservers?: string[] | undefined;
  };
  registrarInfo: {
    registrar: string;
    iana_id: string;
    url: string;
    abuseEmail: string;
    abusePhone: string;
  };
  registrantInfo: {
    fullName: string;
    phone: string;
    email: string;
    address: {
      street: string;
      city: string;
      zipcode: string;
      country: string;
      state?: string | undefined;
    };
  };
  rawWhoisText?: string | undefined;
  rawWhoisJson?: any;
}

// --- 3. Helper Functions ---

/**
 * Extracts a specific property value from a jCard (vCard JSON) array.
 */
function getVCardProp(vcardEntry: JCard | undefined, propName: string): string {
  if (!vcardEntry || !Array.isArray(vcardEntry) || vcardEntry.length < 2) return "";

  const properties = vcardEntry[1];

  // Find the property tuple where the first element matches the propName
  const prop = properties.find((p) => p[0] === propName);

  // The value is usually at index 3.
  // We cast to string to ensure type safety, though it can be a number sometimes.
  return prop && prop[3] ? String(prop[3]) : "";
}

/**
 * Parses RDAP JSON data to match the WhoisSchema.
 */
export function parseRdapToWhois(rdapResponse: RdapData): Whois {
  // Handle case where data might be wrapped in an "rdap" property
  const data = rdapResponse.rdap || rdapResponse;

  // --- Domain Info ---
  const events = data.events || [];

  const getEventDate = (action: string): string =>
    events.find(e => e.eventAction === action)?.eventDate || "";

  const domainInfo = {
    domainName: data.ldhName || "",
    registeredDate: getEventDate("registration"),
    expiryDate: getEventDate("expiration"),
    lastUpdate: getEventDate("last changed") || getEventDate("last update of RDAP database"),
    status: (data.status || []).map((s) => s.trim()),
    nameservers: (data.nameservers || [])
      .map((ns) => ns.ldhName?.trim())
      .filter((n): n is string => !!n),
  };

  // --- Entity Parsing ---
  const entities = data.entities || [];

  // Find Registrar
  const registrarEntity = entities.find(e => e.roles?.includes("registrar"));
  const registrarVcard = registrarEntity?.vcardArray;

  // Find Abuse Contact (check nested entities inside Registrar first, then top level)
  const abuseEntity = registrarEntity?.entities?.find(e => e.roles?.includes("abuse"))
    || entities.find(e => e.roles?.includes("abuse"));
  const abuseVcard = abuseEntity?.vcardArray;

  // Find Registrant
  const registrantEntity = entities.find(e => e.roles?.includes("registrant"));
  const registrantVcard = registrantEntity?.vcardArray;

  // --- Registrar Info ---
  const ianaIdObj = registrarEntity?.publicIds?.find(id => id.type?.includes("IANA"));

  // Find a suitable URL link
  const registrarUrlObj = registrarEntity?.links?.find(l => l.rel === "about" || l.rel === "related");

  const registrarInfo = {
    registrar: getVCardProp(registrarVcard, "fn") || "Unknown",
    iana_id: ianaIdObj?.identifier || "",
    url: registrarUrlObj?.href || "",
    abuseEmail: getVCardProp(abuseVcard, "email"),
    abusePhone: getVCardProp(abuseVcard, "tel"),
  };

  // --- Registrant Info ---
  // Extracting address parts manually from the vCard 'adr' property
  // vCard 'adr' format: [ ..., ..., street, locality, region, zip, country ]
  // We temporarily access the raw array logic inside getVCardProp,
  // but since we need index access, we'll do a manual find here for 'adr'.
  let addressObj = {
    street: "",
    city: "",
    state: "",
    zipcode: "",
    country: ""
  };

  if (registrantVcard && registrantVcard[1]) {
    const adrProp = registrantVcard[1].find(p => p[0] === 'adr');
    if (adrProp && Array.isArray(adrProp[3])) {
      // The value part of 'adr' is an array of strings
      const adrParts = adrProp[3] as unknown as string[];
      addressObj = {
        street: adrParts[2] || "",
        city: adrParts[3] || "",
        state: adrParts[4] || "",
        zipcode: adrParts[5] || "",
        country: adrParts[6] || ""
      };
    }
  }

  const registrantInfo = {
    fullName: getVCardProp(registrantVcard, "fn"),
    phone: getVCardProp(registrantVcard, "tel"),
    email: getVCardProp(registrantVcard, "email"),
    address: addressObj,
  };

  // --- Return Final Object ---
  return {
    domainInfo,
    registrarInfo,
    registrantInfo,
    rawWhoisText: JSON.stringify(data, null, 2),
    rawWhoisJson: rdapResponse,
  };
}
