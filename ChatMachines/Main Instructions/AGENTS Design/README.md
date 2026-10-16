# AGENTS instruction design

## Canonical working source

Repository: BestNameYet/StateMachines, branch main.
Working file: [AGENTS-root-array.json](AGENTS-root-array.json).

This repository file is the sole working source for this conversation's AGENTS instruction-design project. Make subsequent edits here through the existing AGENTS Procedure. Library copies are historical snapshots and must not be edited as parallel working copies. Downloaded files are copies, not a second authority.

This design working copy is not activated as a replacement for the account-level governing instruction. Existing instructions elsewhere in the repository are not replaced by this migration.

## Contents

- AGENTS-root-array.json: current working array, copied byte-for-byte.
- sources/: original governing instruction, extracted source object, and supplied conversation audit.
- drafts/: earlier evidence/report designs, preserved without activation.
- analysis/: complete requirements breakdown.
- tools/json-to-array.js: conversion script with the historical source embedded in its outer const.
- history/JWRS-root-array.json: earlier conversion of the wrong source, retained for history only.
- design-notes.md: later decisions discussed after the earlier drafts.
- migration-manifest.json: source identifiers, byte counts, and checksums.

The source audit is stored losslessly as gzip. Decompress it to obtain the original HTML. Both compressed and original checksums are recorded.

## Current working state

The working array contains 19 entries. Five metadata fields were grouped into one metadata object. The old purpose text was preserved verbatim as instruction and purpose became a document description. The opening entries are metadata, instruction_source, definitions, instruction.

The request to split instruction into projection and execution instructions is still pending. Migration does not perform that edit.

## Procedure

First read the existing procedure README at this repository path:
ChatMachines/Workflow Interactive Procedures/AGENTS Procedure/README.md.

Start a fresh procedure issue using the existing AGENTS Procedure template. Identify this working file using its repository-relative path:
ChatMachines/Main Instructions/AGENTS Design/AGENTS-root-array.json.

Procedure issue 18 records this migration. Issue 17 records the earlier attempt blocked by the absent repository file.

## Preservation

All nine imported files retain their original bytes, except the HTML audit's explicitly recorded lossless gzip encoding. The three migration documents are new. Historical snapshots and drafts are inputs, not alternative canonical working instructions. Future decisions supersede older drafts only when applied explicitly to the working copy.
