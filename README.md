# Marriage Calculator

A web app for settling points in the Nepali card game **Marriage**. One phone or laptop keeps score for the whole table, and it works offline.

## Using it

1. Enter the players' names, in seating order, and press **Start game**.
2. After each hand:
   - pick the player who **won** (ended the game),
   - tick **Seen** for every player who saw the joker (tiplu),
   - type each seen player's **maal** total,
   - tick **8 dublees** if the winner ended with dublees.
3. The **Net** column shows each player's result for the hand. Press **Save hand** to add it to the running totals.

History is saved in the browser, so a reload won't lose it. Use ✕ on a history row to undo a hand, or **New game** to start again.

## Scoring rules

- Each opponent pays the winner **3** if they saw the joker, **10** if they did not.
- If the winner ended with 8 dublees, each opponent pays an extra **5**.
- Players who did not see the joker score **0** maal (house rule).
- Everyone settles the difference in maal with everyone else. This is worked out through the winner: each player pays `T + w − n × S`. T is the total maal, S is that player's maal, n is the number of players and w is their 3/10 (+5). A negative amount means the winner pays them.

## Development

There's no build step. Serve the folder with any static server:

```sh
npm start          # or: python3 -m http.server
npm test           # scoring unit tests (Node 20+)
```

To host it for free, turn on **GitHub Pages** for this repo (Settings → Pages → deploy from branch, root folder).
