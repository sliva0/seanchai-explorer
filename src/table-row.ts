/** Names compared as the tables wrap and punctuate them: "3GPP-SGSN-" over "Address" is 3GPP-SGSN-Address. */
export const normalizeName = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** What stands beside a name in an AVP table: its code or clause, its type, or the document defining it. */
export const rowEvidence = /^(?:\d+\b|NOTE\b|[A-Z]?\d*(?:\.\d+)+\b|\[\d+\]|(?:3GPP2?|IETF|RFC|TS|ETSI|NASREQ|draft-)|(?:OctetString|UTF8String|Unsigned|Integer|Float|Enumerated|Grouped|Time|Address|Diam|IPFilter|QoSFilter)|N\/A\b)/i;
