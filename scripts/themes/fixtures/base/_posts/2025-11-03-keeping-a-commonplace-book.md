---
layout: post
title: "Keeping a commonplace book"
date: 2025-11-03
slug: keeping-a-commonplace-book
tags: ["notes", "craft"]
excerpt: "A long note on the oldest writing tool I use, with the system that keeps it useful."
notion_id: "fixture-post-02"
---
A commonplace book is a notebook of things worth keeping: quotations, sums,
recipes, the name of a bolt. I have kept one for nineteen years.[^1] This is how
it works, in more detail than anyone needs.

## The rules

1. Write the date before anything else.
2. Copy quotations by hand, with the page number.
3. Never tear out a page; cross it out instead.
4. Index the book when it is full, not before.

**Paper** - a plain A5 notebook with numbered pages.

**Pen** - whatever is in the coat pocket.

**Index** - the last four pages, alphabetical, by subject.

## A worked example

Here is the index format I settled on after many bad ones:

| Subject | Pages | Notes |
| --- | --- | --- |
| Tides | 4, 17, 52 | tables copied from the harbour office |
| Radios | 9, 10 | valve numbers, a wiring sketch |
| Bread | 33 | a recipe from a neighbour |

When the book moved to a computer I wrote a tiny script to rebuild the index:

```python
import re

def index(lines):
    entries = {}
    for page, line in lines:
        for tag in re.findall(r"#(\w+)", line):
            entries.setdefault(tag, []).append(page)
    return dict(sorted(entries.items()))
```

![A spread of handwritten notes in soft colour]({{FIXTURES}}/inline-figure.jpg)

The script lives in the back of the book too, written out by hand.[^2]

> Whatever you copy out, you keep twice: once on the page and once in the hand.

## What it is for

Mostly it is for remembering where I read something. Sometimes it is for
noticing that I have copied the same sentence three times in ten years, which
tells me more about myself than any diary.

[^1]: The first one was a school exercise book with a broken spine.
[^2]: Yes, this is a little absurd.
