import type { DocumentSummary } from './types.ts';

/**
 * What a document is for, in the names people skim for: its interfaces and
 * reference points, or for an RFC its application. The export has no such field,
 * and titles word it too many ways to read it from them, so this is hand-curated
 * from each document's scope clause and table of contents.
 *
 * Keyed by `reference`, or by `id` where one edition differs from the others. An
 * empty string says the document has none. See "Interface names" in the README.
 */
const INTERFACES: Record<string, string> = {
  // 3GPP
  'TS29.061': 'Gi, SGi, Gmb, SGmb, Mz',
  '29061-6f0': 'Gi, Gmb',
  'TS29.109': 'Zh, Dz, Zn, Zpn',
  'TS29.128': 'T6a, T6ai, T6b, T6bi, T7',
  'TS29.140': 'MM10',
  'TS29.153': 'Ns',
  'TS29.154': 'Nt, Nta',
  'TS29.172': 'SLg, Lgd',
  'TS29.173': 'SLh',
  'TS29.209': 'Gq',
  'TS29.210': 'Gx',
  'TS29.211': 'Rx',
  'TS29.212': 'Gx, Gxx, Sd, St, S15',
  '29212-bj0': 'Gx, Gxx, Sd, S15',
  'TS29.214': 'Rx',
  'TS29.215': 'S9, S9a, S9a*',
  'TS29.217': 'Np',
  'TS29.219': 'Sy',
  'TS29.229': 'Cx, Dx',
  'TS29.230': '',
  'TS29.234': 'Dw, Wa, Wd, Wx, Wm, Wg, Pr',
  'TS29.272': "S6a, S6d, S7a, S7d, S13, S13'",
  'TS29.273': "SWa, STa, SWd, SWm, SWx, S6b, SWa', SWd'",
  'TS29.283': 'MCPTT-2, MCVideo-2, MCData-2, CSC-13',
  'TS29.329': 'Sh',
  'TS29.330': 'Sc',
  'TS29.336': 'S6m, S6n, S6t',
  'TS29.337': 'T4',
  'TS29.338': 'S6c, SGd, Gdd',
  'TS29.343': 'PC2',
  'TS29.344': 'PC4a',
  'TS29.345': 'PC6, PC7',
  'TS29.368': 'Tsp',
  'TS29.388': 'V4',
  'TS29.389': 'V6',
  'TS29.468': 'MB2-C',
  'TS29.561': 'N6',
  'TS32.299': 'Ro, Rf',

  // ETSI
  'ETSI-ES283.026': 'Rq',
  'ETSI-ES283.034': 'e4',
  'ETSI-ES283.035': 'e2',
  'ETSI-TS183.017': "Gq'",
  'ETSI-TS183.020': 'e5',
  'ETSI-TS183.033': 'Cx, Dx',
  'ETSI-TS183.059-1': 'a2',
  'ETSI-TS183.066': 'a4',

  // 3GPP2
  '3GPP2-X.S0013-006': 'Cx',
  '3GPP2-X.S0013-013': 'Tx',
  '3GPP2-X.S0013-014': 'Ty',
  '3GPP2-X.S0057': 'Gxa, STa',

  // Others
  'oneM2M-TS-0004': 'Mch',
  'OMA-DDS-Charging_Data': 'CH-1, CH-2',

  // IETF: the application, or what the RFC adds where it defines none.
  RFC4004: 'MIPv4',
  RFC4005: 'NAS',
  RFC4006: 'Credit-Control',
  RFC4072: 'EAP',
  RFC4590: 'Digest (RADIUS)',
  RFC4740: 'SIP',
  RFC5447: 'MIPv6',
  RFC5580: 'Location',
  RFC5624: 'QoS AVPs',
  RFC5777: 'QoS AVPs',
  RFC5778: 'MIPv6',
  RFC5779: 'PMIPv6',
  RFC5866: 'QoS',
  RFC6733: 'Base',
  RFC6734: 'Key transport',
  RFC6736: 'NAT Control',
  RFC6737: 'Capabilities Update',
  RFC6738: 'IKEv2',
  RFC6942: 'ERP',
  RFC7075: 'Realm redirect',
  RFC7155: 'NAS',
  RFC7683: 'DOIC',
  RFC7944: 'DRMP',
  RFC8506: 'Credit-Control',
  RFC8581: 'DOIC agent overload',
  RFC8582: 'DOIC rate control',
  RFC8583: 'Load',
};

type Keyed = Pick<DocumentSummary, 'id' | 'reference'>;

/** The document's entry, which is undefined only for one the map has yet to be told of. */
export const curatedInterfaces = (doc: Keyed): string | undefined => INTERFACES[doc.id] ?? INTERFACES[doc.reference];

export const interfacesOf = (doc: Keyed): string => curatedInterfaces(doc) ?? '';
