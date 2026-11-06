## Question
When JSON text is sent between systems, which character encoding must it use, and may an implementation add a byte order mark to it?

## Findings
- JSON text sent between systems outside a closed ecosystem must be encoded as UTF-8. [S1]
- An implementation must not add a byte order mark to the start of JSON text it sends over a network. [S2]
- Errata for the document list the encoding rule as unchanged. [S3]

## Sources
[S1] https://www.rfc-editor.org/rfc/rfc8259.txt "JSON text exchanged between systems that are not part of a closed ecosystem MUST be encoded using UTF-8"
[S2] https://www.rfc-editor.org/rfc/rfc8259.txt "Implementations MUST NOT add a byte order mark (U+FEFF) to the beginning of a networked-transmitted JSON text"
[S3] https://www.rfc-editor.org/rfc/rfc8259-errata.txt "Section 8.1 is unchanged since publication"
