---
layout: post
title: "A tiny cache for slow harbour Wi-Fi"
date: 2025-09-12
slug: a-tiny-cache-for-slow-wifi
tags: ["web", "notes"]
excerpt: "The ferry terminal's Wi-Fi drops every few minutes, so the timetable page now works offline."
cover_image: "{{FIXTURES}}/field-notes.jpg"
notion_id: "fixture-developers-post-04"
---
The ferry terminal has one Wi-Fi access point and four hundred passengers.
I added a small offline cache to the timetable page so it keeps working
when the connection drops. It took forty lines and saved a lot of
shouting at the ticket desk.
