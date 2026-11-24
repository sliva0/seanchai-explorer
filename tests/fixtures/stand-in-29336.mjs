// A stand-in for TS 29.336 V19.1.0, which the fixture does not hold: its AVP table's row of Communication-Pattern-Set,
// which TS 29.272 reuses, and the clause that row points to, as the export would write them.
const AVP = 'Communication-Pattern-Set';

/** A TS 29.336 of one AVP table row and the clause it points to, as the export would write it. */
export function standIn(index) {
  const lines = [
    { section: '8.4.1', anchor: '8.4.1', tokens: [{ text: '; Type: AVP Table\n' }] },
    {
      section: '8.4.1',
      tokens: [
        {
          avp: AVP,
          source: { name: AVP, page: 48, row: true, section: '8.4.1' },
          target: { document: '29336-j10', section: '8.4.26' },
          text: AVP,
        },
        { text: '   3114   ' },
        { source: { page: 48, section: '8.4.26' }, text: '8.4.26' },
        { text: '   Grouped   M,V   -   -   -   No\n' },
      ],
    },
    { section: '8.4.26', anchor: '8.4.26', tokens: [{ text: `; Type: Grouped AVP\n` }] },
  ];
  return {
    id: '29336-j10',
    path: 'documents/29336-j10.json',
    schema_version: index.schema_version,
    publisher: '3GPP',
    reference: 'TS29.336',
    specification: '3GPP TS 29.336',
    title: 'Diameter based interfaces for communicating with packet data networks and applications',
    version: '19.1.0',
    release: 19,
    interfaces: ['S6m'],
    pinned: null,
    raw: null,
    source: { kind: 'etsi-pdf', local: null, text: null, url: 'https://www.etsi.org/x/ts_129336v190100p.pdf' },
    corrections: {},
    findings: [],
    holes: [],
    sections: [
      { section: '8.4.1', page: 48, title: 'General' },
      { section: '8.4.26', page: 55, title: AVP },
    ],
    lines,
    blocks: [
      {
        type: 'AVP Table',
        section: '8.4.1',
        page: 48,
        line: 0,
        last: 1,
        columns: ['Name', 'Code', 'Section', 'Type', 'Must', 'May', 'S.not', 'M.not', 'Encrypt'],
        fields: { Section: '8.4.1', Table: '8.4.1/1' },
        rows: [
          {
            line: 1,
            name: AVP,
            code: 3114,
            type: 'Grouped',
            vendor: 10415,
            cells: [AVP, '3114', '8.4.26', 'Grouped', 'M,V', '-', '-', '-', 'No'],
          },
        ],
      },
    ],
  };
}


/** The stand-in's summary, for the index to list beside the fixture's. */
export function standInSummary(index) {
  const summary = { ...standIn(index) };
  for (const key of ['lines', 'blocks', 'sections', 'corrections', 'findings', 'holes', 'schema_version']) delete summary[key];
  return summary;
}
