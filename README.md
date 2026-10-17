# Marriage Calculator

A casino-style scorekeeper for the Nepali card game **Marriage**. One phone or laptop keeps score for the whole table, and it works offline.

Players sit around a felt table with avatars and chip balances. When a hand is settled, chips fly from the players who pay to the winner, with confetti and sound effects. There's also a leaderboard, win streaks and a hand log.

## Using it

1. Enter the players' names in seating order (tap an avatar to change it), then press **Deal me in**.
2. After each hand:
   - tap 👑 on the player who **won** (ended the game),
   - tap 👁 for every player who saw the joker (🙈 means unseen),
   - enter each seen player's **maal** with − / + or by typing,
   - tap **🃏 8 dublees** if the winner ended with dublees.
3. Each seat shows its result for the hand as you go. Press **Settle** to pay out.

When you're done for the night, tap **💰 Cash out** at the top. It shows the fewest payments that square everyone up, like "Bikash pays Asha 50". You can add a money value per point (e.g. `Rs 1`) and copy or share the summary to your group chat.

Scores are saved in the browser, so a reload won't lose them. Use **Undo last** or ✕ in the hand log to remove a hand, or **New table** to start again. 🔊 turns the sound on or off.

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
