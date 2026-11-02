// Elasticsearch escapes source text before adding these two highlighting tags.
// Render the content as React text nodes; never inject a snippet as HTML.
function decodeText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#39|#x27|#x2F);/gi, entity => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
    '&#39;': "'", '&#x27;': "'", '&#x2f;': '/',
  })[entity.toLowerCase()] || entity)
}

export function SearchExcerpt({ fragments }: { fragments: string[] }) {
  return <span className="search-excerpt">{fragments.map((fragment, index) => <span className="search-fragment" key={index}>{fragment.split(/(<mark>[\s\S]*?<\/mark>)/g).map((part, partIndex) => part.startsWith('<mark>') && part.endsWith('</mark>')
    ? <mark key={partIndex}>{decodeText(part.slice(6, -7))}</mark>
    : decodeText(part))}</span>)}</span>
}
