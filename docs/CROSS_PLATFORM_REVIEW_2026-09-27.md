# Cross-platform review, 2026-09-27

## Scope and decision

Reviewed `Codex_V5_All_In_One.zip` as a proposed change, compared it with local commit `8a0817a`, and integrated only changes supported by source review or browser reproduction. The ZIP's mocked React, synthetic hit-target, and pixel tests were useful leads, but they are not native Mac or Linux results.

## Confirmed problems and fixes

| Problem reproduced locally | Resolution |
| --- | --- |
| Opening Fearless from the album index, playing Change, then choosing Speak Now could return the player to Fearless/Breathe. | Navigation now sends a numbered, one-time album request. Later playback state changes cannot replay it. |
| A clicked track or homepage music command could call `audio.play()` after an animation or React effect, losing the browser's click activation. | Deliberate play commands load and invoke `play()` in the click handler; automatic end-of-track playback remains separate. |
| At 2560×900, the left intro overlapped the track wheel and the selected album card could run below the viewport. | Measure the actual intro and reserve space for the wheel. Bound album-card width on wide, short screens. |
| At 1024×600, the hero exceeded the viewport; at 1600×550, corridor progress controls fell below it. | Add viewport-height rules for the hero and measure the corridor's actual header/footer space. |
| At 320×568, the mobile transport controls overlapped the album carousel. | Reduce the cover and carousel heights only for very short, narrow viewports. |
| Losing WebGL after startup could leave the experience without a usable scene. | Keep the pinned DOM structure stable and show static artwork while the journey is in view; stop its render loop. |
| A media element can emit `play`, then fail decoding without ever emitting `playing`; it may even report `paused=false`. | Treat `playing` as the UI's successful-play signal, pause on error, and reload a failed source on an explicit retry. |

The integration also guards stale `ended` events, preserves keyboard activation after drag suppression, uses a non-passive wheel handler in timed lyrics, and keeps a scroll-stop fallback for the album carousel.

## Validation performed

- `pnpm lint`, `pnpm build`, `pnpm test:audio` (30), `pnpm test:cylinder` (8), and `pnpm test:music-sync` (14) passed.
- Real browser sessions on Windows: Edge/Chromium, Firefox, and Playwright WebKit. Tested player navigation, play/pause, track and album changes, keyboard track selection, timed-lyric wheel/seek, and 320×568, 390×667, 1024×600, 1600×550, and 2560×900 layouts. No uncaught page errors in the final clean-load flows.
- Edge flow: album index → Fearless → Change → pause → Speak Now → play → close/reopen kept Speak Now. Seeking near a real track's end advanced once; a synthetic stale `ended` event did not advance.
- Edge network abort on one track produced an error; clicking Play after the route recovered reloaded the same source and resumed. WebKit reported a decode error on the local FLAC and kept the UI paused with a visible message after retry.
- WebGL loss and early 2D-context failure were simulated in Edge. The static fallback appeared and became hidden after the journey left the viewport, without page errors.

## Remaining verification boundaries

- Native macOS Safari/Chrome and native Linux GUI were unavailable. WSL Ubuntu's Snap Firefox could not launch a usable headless screenshot, so the Firefox engine result above is from Windows. Browser-engine coverage does not prove OS-specific font rendering, media policy, trackpad inertia, or window hit testing.
- The local catalog contains FLAC audio. Windows WebKit rejected tested FLAC files even though its `canPlayType` result was nonempty; Edge and Firefox played the tested files. A compatible MP3/AAC derivative is needed wherever a deployed browser cannot decode the original media. No audio, lyrics, artwork, generated catalog, or credentials are included in the commit.
- Real R2 delivery and production Catalog, including cross-origin media headers and Range behavior, were not exercised. Local dev audio returned Range responses; that does not validate the remote origin.
- A Mac acceptance pass should repeat: index → Fearless → another track → pause/play/next → Speak Now → close/reopen; trackpad wheel/drag and timed-lyric seek; 3D journey through the corridor; and screenshots at the same CSS viewport as the Windows baseline. Record any `play()` rejection and the actual media response before attributing a difference to Safari.
