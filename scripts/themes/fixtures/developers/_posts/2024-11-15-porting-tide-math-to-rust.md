---
layout: post
title: "Porting the tide math to Rust"
date: 2024-11-15
slug: porting-tide-math-to-rust
tags: ["rust", "tidewatch"]
excerpt: "Notes from rewriting the prediction core, and why the old version stays."
cover_image: "{{FIXTURES}}/square-moss.jpg"
notion_id: "fixture-developers-post-07"
---
The new core is ten times faster, but the old Python version stays as the
reference. Every release checks that both give the same answers for a
thousand harbours.
