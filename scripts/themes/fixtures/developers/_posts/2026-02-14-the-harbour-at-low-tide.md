---
layout: post
title: "The harbour at low tide, as a dataset"
date: 2026-02-14
slug: the-harbour-at-low-tide
tags: ["data", "tidewatch"]
excerpt: "What a year of low-water measurements taught me about the harbour, and about my own code."
cover_image: "{{FIXTURES}}/cover-harbour.jpg"
featured: true
notion_id: "fixture-developers-post-02"
---
Twice a day the water leaves and the harbour shows its bones. For a year I
logged every low tide with a cheap sensor on the second mooring post.

The readings disagreed with my own predictions by up to eleven minutes.
The fault was mine: a rounding error that had lived in the code for three
years. The fix was one line; finding it took a winter.
