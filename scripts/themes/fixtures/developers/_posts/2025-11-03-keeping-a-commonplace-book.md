---
layout: post
title: "Keeping a commonplace book in plain text"
date: 2025-11-03
slug: keeping-a-commonplace-book
tags: ["notes", "tools"]
excerpt: "How I keep twelve years of notes in plain text files, with the small script that indexes them."
notion_id: "fixture-developers-post-03"
---
A commonplace book is a notebook of things worth keeping: commands, error
messages, quotations, the name of a bolt. I have kept mine in plain text
files for twelve years.[^1] This is how it works.

## The rules

1. Write the date before anything else.
2. Copy the source with every note, even a page number.
3. Never delete an entry; cross it out instead.

**Files** - one text file per month, named by date.

**Index** - a list of subjects at the top of each file.

## A worked example

| Subject | Files | Notes |
| --- | --- | --- |
| Tides | 2024-03, 2025-01 | survey formats |
| Rust | 2025-06 | borrow checker notes |
| Bread | 2023-11 | a recipe from a neighbour |

> Write it down the first time, or look it up forever.

When the notes moved to a computer I wrote a tiny script to rebuild the index:

```python
import pathlib, re

index = {}
for note in sorted(pathlib.Path("notes").glob("*.txt")):
    for subject in re.findall(r"^# (.+)$", note.read_text(), re.M):
        index.setdefault(subject, []).append(note.stem)
print(index)
```

[^1]: Before that, a paper notebook that I still keep for sketches.
