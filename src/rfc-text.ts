export function rfcPages(text: string) {
  return text.split('\f').map((text, index) => ({
    text, page: index + 1,
    lines: text.split(/(?<=\n)/).map(text => {
      const heading = text.match(/^((?:\d+|[A-Z])(?:\.\d+[A-Za-z]*)*)\.?\s+\S/);
      return { text, section: heading && !/\.{3}|…/.test(text) ? heading[1] : null };
    }),
  }));
}
