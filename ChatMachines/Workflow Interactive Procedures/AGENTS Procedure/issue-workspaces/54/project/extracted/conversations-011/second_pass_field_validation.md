# Second-pass field validation

Validated 34 conversations, 306 mapping nodes, and 272 message objects from one smallest source bin in each batch 00–03. Explicit children fields are absent in this sample; inverse-parent adjacency reveals 3 branch points. Source content parts include mixed JSON values; metadata paths are conditional. Unobserved keys remain unverified outside the sample. topic/project/outputs are absent as direct conversation keys and require evidence-grounded derivation.

## Scope and method

One smallest file by byte size per batch 00–03 (34 conversations total). Convenience/size-stratified sample, biased toward short conversations; not statistically representative of archive-wide presence rates. Every local source was checked against its current Git blob ID. Rates below apply only to the indicated sample denominator.

## Field observations

| Field | JSON path | Types | Presence | Status |
|---|---|---|---|---|
| id | $[*].id | string | 34/34 eligible conversation records; 34 occurrences | verified in sample |
| conversation_id | $[*].conversation_id | string | 34/34 eligible conversation records; 34 occurrences | verified in sample |
| title | $[*].title | string | 34/34 eligible conversation records; 34 occurrences | verified in sample |
| create_time | $[*].create_time | number | 34/34 eligible conversation records; 34 occurrences | verified in sample |
| update_time | $[*].update_time | number | 34/34 eligible conversation records; 34 occurrences | verified in sample |
| current_node | $[*].current_node | string | 34/34 eligible conversation records; 34 occurrences | verified in sample |
| mapping | $[*].mapping | object | 34/34 eligible conversation records; 34 occurrences | verified in sample |
| default_model_slug | $[*].default_model_slug | string | 34/34 eligible conversation records; 34 occurrences | verified in sample |
| mapping entry key | $[*].mapping{nodeId} | string | 34/34 eligible conversation records; 306 occurrences | verified in sample |
| parent | $[*].mapping[nodeId].parent | null, string | 306/306 eligible node records; 306 occurrences | verified in sample |
| children | $[*].mapping[nodeId].children | unobserved | 0/306 eligible node records; 0 occurrences | absent in sample; not globally disproven |
| message | $[*].mapping[nodeId].message | null, object | 306/306 eligible node records; 306 occurrences | verified in sample |
| message.id | $[*].mapping[nodeId].message.id | string | 272/272 eligible message records; 272 occurrences | verified in sample |
| message.author.role | $[*].mapping[nodeId].message.author.role | string | 272/272 eligible message records; 272 occurrences | verified in sample |
| message.create_time | $[*].mapping[nodeId].message.create_time | number | 272/272 eligible message records; 272 occurrences | verified in sample |
| message.content.parts | $[*].mapping[nodeId].message.content.parts | array | 224/272 eligible message records; 224 occurrences | verified in sample |
| asset_pointer | $[*].mapping[nodeId].message.content.parts[*].asset_pointer | string | 20/272 eligible message records; 51 occurrences | verified in sample |
| asset_pointer | $[*].mapping[nodeId].message.content.parts[*].audio_asset_pointer.asset_pointer | string | 2/272 eligible message records; 2 occurrences | verified in sample |
| attachments | $[*].mapping[nodeId].message.metadata.attachments | array | 20/272 eligible message records; 20 occurrences | verified in sample |
| content_references | $[*].mapping[nodeId].message.metadata.content_references | array | 157/272 eligible message records; 157 occurrences | verified in sample |
| file_name | not established from sample | unobserved | 0/272 eligible message records; 0 occurrences | absent in sample; not globally disproven |
| metadata | $[*].mapping[nodeId].message.content.parts[*].audio_asset_pointer.metadata | object | 2/272 eligible message records; 2 occurrences | verified in sample |
| metadata | $[*].mapping[nodeId].message.content.parts[*].metadata | object | 20/272 eligible message records; 51 occurrences | verified in sample |
| metadata | $[*].mapping[nodeId].message.metadata | object | 218/272 eligible message records; 218 occurrences | verified in sample |
| metadata | $[*].mapping[nodeId].message.metadata.content_references[*].metadata | null | 12/272 eligible message records; 33 occurrences | verified in sample |
| metadata_sources | not established from sample | unobserved | 0/272 eligible message records; 0 occurrences | absent in sample; not globally disproven |
| mime_type | $[*].mapping[nodeId].message.content.parts[*].mime_type | string | 1/272 eligible message records; 1 occurrences | verified in sample |
| mime_type | $[*].mapping[nodeId].message.metadata.attachments[*].mime_type | string | 3/272 eligible message records; 4 occurrences | verified in sample |
| size_bytes | $[*].mapping[nodeId].message.content.parts[*].audio_asset_pointer.size_bytes | number | 2/272 eligible message records; 2 occurrences | verified in sample |
| size_bytes | $[*].mapping[nodeId].message.content.parts[*].size_bytes | number | 20/272 eligible message records; 51 occurrences | verified in sample |
| source | not established from sample | unobserved | 0/272 eligible message records; 0 occurrences | absent in sample; not globally disproven |
| source_title | not established from sample | unobserved | 0/272 eligible message records; 0 occurrences | absent in sample; not globally disproven |
| source_type | not established from sample | unobserved | 0/272 eligible message records; 0 occurrences | absent in sample; not globally disproven |
| source_url | not established from sample | unobserved | 0/272 eligible message records; 0 occurrences | absent in sample; not globally disproven |
| sources | $[*].mapping[nodeId].message.metadata.content_references[*].sources | array | 4/272 eligible message records; 4 occurrences | verified in sample |
| topic | $[*].topic | unobserved | 0/34 eligible conversation records; 0 occurrences | absent as direct root key in sample; derived analytical output |
| project | $[*].project | unobserved | 0/34 eligible conversation records; 0 occurrences | absent as direct root key in sample; derived analytical output |
| outputs | $[*].outputs | unobserved | 0/34 eligible conversation records; 0 occurrences | absent as direct root key in sample; derived analytical output |

## Sources

- ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/key-extraction/batch-00/subdivision-04/shard-03-01-10/conversation-file-021-chat-00-09.json — blob `0cb9e9db2cb92e5ca9f218559caa6eefeda5e25f`; 10 conversations.
- ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/key-extraction/batch-01/subdivision-00/shard-05-31-40/conversation-file-044-chat-30-39.json — blob `4dda9cbd40e6e079f49de2e60ca0df72a0e58594`; 10 conversations.
- ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/key-extraction/batch-02/subdivision-08/shard-10-41-50/conversation-file-095-chat-40-49.json — blob `7c470dc572a73c1024a7216adab2146ab5df9e31`; 10 conversations.
- ChatMachines/Workflow Interactive Procedures/Conversation Archive Analysis/key-extraction/batch-03/subdivision-06/shard-14-31-34/conversation-file-134-chat-30-33.json — blob `2091a3aa3e752aa00124de1c43401a913699372d`; 4 conversations.

## Branching and limitations

Parent-derived branching is evidenced in the JSON report with conversation and node references. No explicit children array was observed, so array shape and explicit length > 1 are not verified by this sample.

- Rates use explicitly stated eligible-record denominators, not the full 1,334-conversation archive.
- No conversation text or quotations copied into report or issue return. References identify reopenable evidence.
- Metadata keys absent here must be investigated in targeted richer bins before declaring field validation exhaustive.
- The flattened global inventory cannot establish exact paths or global presence rates.
- Attachment descriptors do not establish attachment-byte availability.

## Next validation work

- Use parent-derived adjacency where children is omitted; distinguish derived edges from explicit source fields.
- Treat content.parts as optional and inspect each array element type; do not assume all strings.
- Perform targeted sampling for file_name/source/source_title/source_url/source_type/metadata_sources and explicit children arrays.
- Keep all unfinished checklist items open.
