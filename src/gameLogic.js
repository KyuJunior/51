// src/gameLogic.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure utility functions for the Iraqi "51" card game.
// No Firebase or React dependencies — pure JS, fully testable in isolation.
// ─────────────────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Point value of each rank for end-of-game scoring.
 * Aces are high (11), face cards are 10, numbers are face value.
 */
const RANK_VALUES = {
  A: 11,
  '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 10, Q: 10, K: 10,
  joker: 0, // Jokers have 0 base value; scoring rules may override
};

// Suit symbols for display convenience
export const SUIT_SYMBOL = {
  hearts:   '♥',
  diamonds: '♦',
  clubs:    '♣',
  spades:   '♠',
  joker:    '🃏',
};

// Suit colours for rendering
export const SUIT_COLOR = {
  hearts:   '#e05252',
  diamonds: '#e05252',
  clubs:    '#1a1f2c', // Dark slate for black suits
  spades:   '#1a1f2c',
  joker:    '#d4a843',
};

// ── generateDeck ──────────────────────────────────────────────────────────────

/**
 * Creates an unshuffled deck of 106 cards:
 *   • 2 × 52 standard cards (hearts, diamonds, clubs, spades × A–K)
 *   • 2 × Jokers
 *
 * Each card object:
 * {
 *   id:    string  — unique identifier, e.g. "hearts_A_0" / "joker_1"
 *   suit:  string  — 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker'
 *   rank:  string  — 'A'|'2'–'10'|'J'|'Q'|'K'|'joker'
 *   value: number  — scoring value (see RANK_VALUES)
 * }
 *
 * @returns {Card[]}
 */
export function generateDeck() {
  const cards = [];

  // Two full 52-card decks
  for (let deckIndex = 0; deckIndex < 2; deckIndex++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id:    `${suit}_${rank}_${deckIndex}`,
          suit,
          rank,
          value: RANK_VALUES[rank],
        });
      }
    }
  }

  // Two Joker cards
  for (let j = 0; j < 2; j++) {
    cards.push({
      id:    `joker_${j}`,
      suit:  'joker',
      rank:  'joker',
      value: RANK_VALUES.joker,
    });
  }

  return cards; // 52 × 2 + 2 = 106 cards
}

// ── shuffleDeck ───────────────────────────────────────────────────────────────

/**
 * Returns a NEW shuffled copy of the provided deck using the
 * Fisher-Yates (Knuth) algorithm. Does NOT mutate the input.
 *
 * @param {Card[]} deck - The deck to shuffle.
 * @returns {Card[]}    - A new shuffled deck.
 */
export function shuffleDeck(deck) {
  const shuffled = [...deck]; // shallow copy — cards are read-only objects

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

// ── dealCards ─────────────────────────────────────────────────────────────────

/**
 * Deals cards to all players from a pre-shuffled deck.
 *
 * Iraqi "51" dealing rules:
 *   • The "starting player" (player index 1, i.e. the one AFTER the host)
 *     receives 15 cards so they can immediately discard one to begin play.
 *   • All other players receive 14 cards.
 *   • The remaining cards become the draw pile (`drawPile`).
 *   • The discard pile starts empty.
 *
 * @param {Card[]}   shuffledDeck - A pre-shuffled 106-card deck.
 * @param {Player[]} players      - Ordered array of player objects { id, name, isHost }.
 *
 * @returns {{
 *   hands:       Record<string, Card[]>,  // map of playerId → hand
 *   drawPile:    Card[],                  // remaining deck after dealing
 *   discardPile: Card[],                  // always [] at game start
 * }}
 */
export function dealCards(shuffledDeck, players) {
  if (!players || players.length < 2) {
    throw new Error('dealCards requires at least 2 players.');
  }
  if (shuffledDeck.length < 106) {
    throw new Error('Deck must have 106 cards before dealing.');
  }

  // Work on a mutable copy so we don't touch the original
  const deck = [...shuffledDeck];

  /**
   * The starting player is the one immediately after the host (index 1).
   * If somehow there's only 1 player (shouldn't happen due to validation),
   * fall back to index 0.
   */
  const startingPlayerIndex = players.length > 1 ? 1 : 0;

  // Build the hands map: playerId → []
  const hands = {};
  for (const player of players) {
    hands[player.id] = [];
  }

  // Deal cards one by one round-robin style, but give the starting player
  // an extra card on the first pass.
  //
  // Strategy: deal 14 cards to everyone first, then add 1 extra to starter.
  let cardIndex = 0;

  for (let round = 0; round < 14; round++) {
    for (const player of players) {
      hands[player.id].push(deck[cardIndex++]);
    }
  }

  // Give the extra 15th card to the starting player
  hands[players[startingPlayerIndex].id].push(deck[cardIndex++]);

  // Everything left is the draw pile
  const drawPile = deck.slice(cardIndex);

  return {
    hands,          // { [playerId]: Card[] }
    drawPile,       // Card[] — remaining after deal
    discardPile: [], // always starts empty
  };
}

// ── Helpers (re-exported for use in game board later) ─────────────────────────

/**
 * Returns true if a card is a Joker (can be used as a wildcard).
 * @param {Card} card
 * @returns {boolean}
 */
export const isJoker = (card) => card.suit === 'joker';

/**
 * Returns the numeric sort-order of a rank for sequence detection.
 * A=1, 2–10 face value, J=11, Q=12, K=13, Joker=14 (wildcard, sorts last).
 * @param {string} rank
 * @returns {number}
 */
export function rankOrder(rank) {
  if (rank === 'joker') return 14;
  const order = { A: 1, J: 11, Q: 12, K: 13 };
  return order[rank] ?? parseInt(rank, 10);
}

// ── Private helper ────────────────────────────────────────────────────────────

/**
 * Maps a numeric rank order (1–13) back to a point value.
 * Used when calculating Joker values inside runs.
 * order 1 = Ace (11pts), 2-10 = face, 11=J/12=Q/13=K (10pts each).
 */
function _rankValue(order) {
  // 14 is high Ace
  const names = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return RANK_VALUES[names[order]] ?? 0;
}

/**
 * Evaluates all possibilities of Ace interpretation (1 or 14) for a sequence.
 * Returns the best valid orders array (the one with the tightest span).
 */
function _evaluateRunOptions(regulars, jokers) {
  let baseOrdersList = [[]];
  for (const c of regulars) {
    if (c.rank === 'A') {
      baseOrdersList = [
        ...baseOrdersList.map(l => [...l, 1]),
        ...baseOrdersList.map(l => [...l, 14])
      ];
    } else {
      const order = rankOrder(c.rank);
      baseOrdersList.forEach(l => l.push(order));
    }
  }

  let bestOrders = null;
  let minSpan = 999;

  for (const raw of baseOrdersList) {
    const orders = [...raw].sort((a, b) => a - b);
    
    let hasDuplicate = false;
    for (let i = 1; i < orders.length; i++) {
      if (orders[i] === orders[i - 1]) hasDuplicate = true;
    }
    if (hasDuplicate) continue;

    const minR = orders[0];
    const maxR = orders[orders.length - 1];
    const span = maxR - minR + 1;
    const gaps = span - regulars.length;

    if (jokers.length >= gaps) {
      const extraJokers = jokers.length - gaps;
      if (extraJokers > 0) {
        const spaceBelow = minR - 1;
        const spaceAbove = 14 - maxR; // 14 because Ace is max 14
        const edgeSpace  = spaceBelow + spaceAbove;
        if (extraJokers <= edgeSpace && span < minSpan) {
          minSpan = span;
          bestOrders = orders;
        }
      } else if (span < minSpan) {
        minSpan = span;
        bestOrders = orders;
      }
    }
  }
  return { valid: bestOrders !== null, bestOrders };
}

// ── isValidSet ────────────────────────────────────────────────────────────────

/**
 * Validates a SET (شرايب): 3–4 cards of the SAME rank, all DIFFERENT suits.
 *
 * Joker rules for sets:
 *   • A Joker counts as a missing suit — it can substitute any suit not
 *     already present among the regular cards.
 *   • At most 2 Jokers are allowed (since max set size is 4 suits).
 *   • You cannot have two Jokers in a 3-card set where both regular cards
 *     are the same suit — that would require the joker to duplicate a suit.
 *
 * @param {Card[]} cards
 * @returns {boolean}
 */
export function isValidSet(cards) {
  // Must be exactly 3 or 4 cards total
  if (cards.length < 3 || cards.length > 4) return false;

  const jokers   = cards.filter(isJoker);
  const regulars = cards.filter(c => !isJoker(c));

  // Edge case: can't form a set with all jokers (no rank reference)
  if (regulars.length === 0) return false;

  // ── Rule 1: All regular cards must share the same rank ──────────────────
  const rank = regulars[0].rank;
  if (!regulars.every(c => c.rank === rank)) return false;

  // ── Rule 2: No duplicate suits among regular cards ──────────────────────
  // (Each suit can appear only once per set — it's a different card)
  const suits = regulars.map(c => c.suit);
  if (new Set(suits).size !== regulars.length) return false;

  // ── Rule 3: Jokers fill missing suits, but total suits ≤ 4 ─────────────
  // suits already present = regulars.length, jokers fill the rest.
  // Total needed = cards.length (3 or 4) — already guaranteed by the size check.
  // Since regulars.length + jokers.length === cards.length (3 or 4),
  // and all regular suits are unique, jokers can always fill the remaining
  // slots (there are exactly 4 suits; we need at most 4 total).
  // No extra validation needed — size check + unique suits + same rank = valid.

  return true;
}

// ── isValidRun ────────────────────────────────────────────────────────────────

/**
 * Validates a RUN (سريات): 3+ consecutive cards of the SAME suit.
 * Rank order: A(1), 2, 3 … 10, J(11), Q(12), K(13).
 * Ace is LOW only (A-2-3 is valid; Q-K-A is NOT).
 *
 * Joker rules for runs:
 *   • A Joker can replace any single missing card in the sequence.
 *   • Multiple Jokers can fill multiple gaps OR extend the run at either end.
 *   • A Joker CANNOT be placed outside the valid rank range (< A or > K).
 *   • The extended run must still fit entirely within ranks 1–13.
 *
 * @param {Card[]} cards
 * @returns {boolean}
 */
export function isValidRun(cards) {
  if (cards.length < 3) return false;

  const jokers   = cards.filter(isJoker);
  const regulars = cards.filter(c => !isJoker(c));

  // Cannot determine suit/rank reference from jokers alone
  if (regulars.length === 0) return false;

  // ── Rule 1: All regular cards must share one suit ───────────────────────
  const suit = regulars[0].suit;
  if (!regulars.every(c => c.suit === suit)) return false;

  // ── Test Sequence Configurations (Ace = 1 or 14) ─────────────────────────
  const { valid } = _evaluateRunOptions(regulars, jokers);
  return valid;
}

// ── calculatePoints ───────────────────────────────────────────────────────────

/**
 * Calculates the total point value of a meld group (set OR run).
 * This is used to check the 51-point threshold for the initial meld.
 *
 * Joker point values:
 *   • In a SET  → the Joker takes the value of the shared rank.
 *   • In a RUN  → the Joker takes the value of the rank it physically
 *                 replaces. Gap-filling jokers are assigned their exact
 *                 rank value; edge-extending jokers are placed upward
 *                 (higher value = higher score, maximising the total).
 *
 * NOTE: This function does NOT validate the group. Call isValidSet /
 * isValidRun first.
 *
 * @param {Card[]} cards - A valid meld group (set or run).
 * @returns {number}     - Total point value.
 */
export function calculatePoints(cards) {
  const jokers   = cards.filter(isJoker);
  const regulars = cards.filter(c => !isJoker(c));

  // Sum of all non-joker cards
  const regularSum = regulars.reduce((sum, c) => sum + c.value, 0);

  if (jokers.length === 0) return regularSum;

  // ── Detect group type ───────────────────────────────────────────────────
  const allSameRank = new Set(regulars.map(c => c.rank)).size === 1;

  // ── SET: Joker takes the shared-rank value ──────────────────────────────
  if (allSameRank && regulars.length > 0) {
    const jokerValue = RANK_VALUES[regulars[0].rank] ?? 0;
    return regularSum + jokers.length * jokerValue;
  }

  // ── RUN: Determine exact position of each Joker ─────────────────────────
  const { valid, bestOrders } = _evaluateRunOptions(regulars, jokers);
  const orders = valid ? bestOrders : regulars.map(c => rankOrder(c.rank)).sort((a, b) => a - b);
  
  const minR = orders[0];
  const maxR = orders[orders.length - 1];

  let jokerPoints  = 0;
  let jokersLeft   = jokers.length;

  const orderSet = new Set(orders);
  for (let r = minR; r <= maxR; r++) {
    if (!orderSet.has(r)) {
      jokerPoints += _rankValue(r);
      jokersLeft--;
    }
  }

  let nextUp = maxR + 1;
  while (jokersLeft > 0 && nextUp <= 14) {
    jokerPoints += _rankValue(nextUp++);
    jokersLeft--;
  }

  let nextDown = minR - 1;
  while (jokersLeft > 0 && nextDown >= 1) {
    jokerPoints += _rankValue(nextDown--);
    jokersLeft--;
  }

  return regularSum + jokerPoints;
}

// ── validateInitialMeld ───────────────────────────────────────────────────────

/**
 * Validates the player's INITIAL meld attempt under the "51" rules.
 *
 * Requirements:
 *   1. Every group is a valid set OR a valid run.
 *   2. There is AT LEAST ONE run among the groups.
 *   3. Combined point total of all groups ≥ 51.
 *
 * @param {Card[][]} arrayOfGroups
 *   An array where each element is an array of cards the player wants
 *   to lay down as one meld group, e.g. [[c1,c2,c3], [c4,c5,c6,c7]].
 *
 * @returns {{ valid: boolean, points?: number, reason?: string }}
 *   • valid  — whether the meld passes all rules.
 *   • points — total points (only when valid: true).
 *   • reason — human-readable failure reason (only when valid: false).
 */
export function validateInitialMeld(arrayOfGroups) {
  if (!arrayOfGroups || arrayOfGroups.length === 0) {
    return { valid: false, reason: 'No meld groups provided.' };
  }

  let totalPoints = 0;
  let hasRun      = false;

  for (let i = 0; i < arrayOfGroups.length; i++) {
    const group = arrayOfGroups[i];

    const isSet = isValidSet(group);
    const isRun = isValidRun(group);

    // ── Rule 1: Every group must be a valid set OR run ───────────────────
    if (!isSet && !isRun) {
      return {
        valid:  false,
        reason: `Group ${i + 1} is not a valid set (شرايب) or run (سريات).`,
      };
    }

    if (isRun) hasRun = true;

    totalPoints += calculatePoints(group);
  }

  // ── Rule 2: (REMOVED) Previously required at least one run (سريات). 
  // Now, players can open with purely Sets (شرايب) as long as points >= 51.

  // ── Rule 3: Points threshold ──────────────────────────────────────────
  if (totalPoints < 51) {
    return {
      valid:  false,
      reason: `Total is ${totalPoints} pts — need at least 51 to open.`,
    };
  }

  return { valid: true, points: totalPoints };
}

// ── canAddToMeld ──────────────────────────────────────────────────────────────

/**
 * Checks whether a single card can legally be appended to an existing
 * table meld (Tarkib — تركيب).
 *
 * Strategy: simply try adding the card and re-validate.
 * This correctly handles Jokers and edge cases with no extra logic.
 *
 * @param {Card}   card      - The card to add.
 * @param {Card[]} meldGroup - An existing valid meld on the table.
 * @returns {boolean}
 */
export function canAddToMeld(card, meldGroup) {
  const expanded = [...meldGroup, card];
  return isValidSet(expanded) || isValidRun(expanded);
}

// ── calculateRoundScores ──────────────────────────────────────────────────────

/**
 * Calculates the penalty scores at the end of a round.
 *
 * Scoring Rules (Standard 51):
 *   • Winner (0 cards) → 0 points.
 *   • Loser without a meld (hasMelded: false) → 100 points penalty.
 *   • Loser with a meld (hasMelded: true) → Sum of card values in hand.
 *       (Face cards=10, Ace=11, Numbers=face, Joker=25 penalty).
 *
 * @param {object} room     - The full Firestore room object.
 * @param {string} winnerId - The Firebase UID of the player who just won.
 * @returns {Record<string, number>} - Map of playerId → penalty points.
 */
export function calculateRoundScores(room, winnerId) {
  const scores = {};

  for (const player of (room.players || [])) {
    if (player.id === winnerId) {
      scores[player.id] = 0;
    } else {
      const hasMelded = room.hasMelded?.[player.id];
      if (!hasMelded) {
        scores[player.id] = 100; // Unmelded penalty
      } else {
        const hand = room.hands?.[player.id] || [];
        scores[player.id] = hand.reduce((total, card) => {
          if (isJoker(card)) return total + 25; // Joker penalty
          return total + card.value;
        }, 0);
      }
    }
  }

  return scores;
}

// ── sortMeld ──────────────────────────────────────────────────────────────────

/**
 * Visually sorts a meld group so it looks correct on the table.
 * Sets: sorted by suit.
 * Runs: sorted by rank, with Jokers explicitly placed into their exact 
 * mathematical gaps or extensions (matching calculatePoints logic).
 * 
 * @param {Card[]} cards 
 * @returns {Card[]} - A new array of sorted cards.
 */
export function sortMeld(cards) {
  if (isValidSet(cards)) {
    const suitWeight = { hearts: 1, clubs: 2, diamonds: 3, spades: 4, joker: 5 };
    return [...cards].sort((a, b) => suitWeight[a.suit] - suitWeight[b.suit]);
  }

  if (isValidRun(cards)) {
    const jokers = cards.filter(isJoker);
    const regulars = cards.filter(c => !isJoker(c));
    
    const { valid, bestOrders } = _evaluateRunOptions(regulars, jokers);
    if (!valid) return cards; 
    
    // Sort regulars based on the best Ace interpretation
    const sortedRegulars = [...regulars].sort((a, b) => {
      const aVal = a.rank === 'A' ? (bestOrders.includes(14) ? 14 : 1) : rankOrder(a.rank);
      const bVal = b.rank === 'A' ? (bestOrders.includes(14) ? 14 : 1) : rankOrder(b.rank);
      return aVal - bVal;
    });

    const result = [];
    let rIdx = 0;
    let jLeft = jokers.length;
    
    const minR = bestOrders[0];
    const maxR = bestOrders[bestOrders.length - 1];
    const orderSet = new Set(bestOrders);

    // 1. Core span
    for (let r = minR; r <= maxR; r++) {
      if (orderSet.has(r)) {
        result.push(sortedRegulars[rIdx++]);
      } else {
        result.push(jokers[--jLeft]); 
      }
    }

    // 2. Extend upwards
    let nextUp = maxR + 1;
    while (jLeft > 0 && nextUp <= 14) {
      result.push(jokers[--jLeft]);
      nextUp++;
    }

    // 3. Extend downwards
    let nextDown = minR - 1;
    while (jLeft > 0 && nextDown >= 1) {
      result.unshift(jokers[--jLeft]); 
      nextDown--;
    }

    return result;
  }
  
  return cards;
}

