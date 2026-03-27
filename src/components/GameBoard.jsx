// src/components/GameBoard.jsx  — Phase 5
// ─────────────────────────────────────────────────────────────────────────────
// Main game screen for the Iraqi "51" card game.
//
// Turn flow:
//  1. Draw a card (draw pile OR top of discard pile)  ← required
//  2. Optionally, before discarding:
//     a. MELD  — group selected hand cards → validate ≥51 pts → Lay Down
//     b. TARKIB — select 1 card → click a table meld to extend it
//  3. Discard a card to end your turn                 ← required
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { playCardSnap, playDraw, playChime } from '../utils/audio';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  SUIT_SYMBOL, SUIT_COLOR, isJoker,
  isValidSet, isValidRun,
  validateInitialMeld, canAddToMeld, calculatePoints, rankOrder, calculateRoundScores, sortMeld
} from '../gameLogic';

// ─── PlayingCard ──────────────────────────────────────────────────────────────
function PlayingCard({ card, selected, onClick, small = false, disabled = false, highlight = false, isNew = false }) {
  const symbol = SUIT_SYMBOL[card.suit] ?? card.suit;
  const isRed  = card.suit === 'hearts' || card.suit === 'diamonds';
  const textColor = isJoker(card) ? 'text-white' : isRed ? 'text-rose-600' : 'text-slate-900';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={`${card.rank}${symbol}`}
      className={[
        'relative border select-none transition-all duration-200 cursor-pointer shrink-0',
        'flex flex-col justify-between overflow-hidden font-sans',
        small ? 'w-11 h-16 text-[10px] p-1 rounded-xl shadow-md' : 'w-16 sm:w-24 aspect-[2.5/3.5] p-1.5 sm:p-2 rounded-xl sm:rounded-2xl shadow-xl',
        selected
          ? 'border-emerald-400 shadow-[0_10px_30px_rgba(52,211,153,0.4)] -translate-y-6 scale-105 z-10'
          : highlight
          ? 'border-emerald-400 shadow-[0_4px_15px_rgba(52,211,153,0.3)]'
          : isNew
          ? 'border-blue-400 shadow-[0_4px_15px_rgba(96,165,250,0.5)] animate-draw'
          : 'border-slate-200/50',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
        isJoker(card) ? 'bg-gradient-to-br from-indigo-900 to-purple-800 border-indigo-500' : 'bg-white',
        textColor
      ].join(' ')}
    >
      {isNew && (
        <div className="absolute top-0 right-0 bg-blue-500 text-white text-[8px] px-1.5 py-0.5 font-bold rounded-bl-lg shadow z-20">
          NEW
        </div>
      )}
      {isJoker(card) ? (
        <span className="m-auto text-3xl leading-none opacity-90 drop-shadow-md">🃏</span>
      ) : (
        <>
          <div className="leading-none font-bold text-left">
            <div className={small ? 'text-xs' : 'text-base sm:text-lg'}>{card.rank}</div>
            <div className={small ? 'text-[8px]' : 'text-sm'}>{symbol}</div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center text-4xl sm:text-5xl opacity-5 pointer-events-none">
            {symbol}
          </div>
          <div className="leading-none font-bold rotate-180 self-end text-left">
            <div className={small ? 'text-xs' : 'text-base sm:text-lg'}>{card.rank}</div>
            <div className={small ? 'text-[8px]' : 'text-sm'}>{symbol}</div>
          </div>
        </>
      )}
    </button>
  );
}

// ─── CardBack ─────────────────────────────────────────────────────────────────
function CardBack({ onClick, onPointerDown, onPointerUp, onPointerLeave, onContextMenu, count, pulsing = false, disabled = false, label, stacked = false }) {
  return (
    <button
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={onContextMenu}
      disabled={disabled}
      title={label}
      className={[
        'w-16 sm:w-24 aspect-[2.5/3.5] rounded-xl sm:rounded-2xl border-2 border-slate-700 select-none transition-all',
        'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-700 via-slate-800 to-slate-900',
        'flex items-center justify-center relative cursor-pointer text-white shadow-xl',
        pulsing ? 'animate-pulse shadow-[0_0_25px_rgba(52,211,153,0.4)] border-emerald-500' : 'hover:-translate-y-2',
        stacked ? 'shadow-[8px_8px_0_rgba(15,23,42,1),12px_12px_20px_rgba(0,0,0,0.8)] -translate-x-1 -translate-y-1' : '',
        disabled ? 'opacity-70 cursor-not-allowed hover:translate-y-0' : ''
      ].join(' ')}
    >
      <div className="absolute inset-2 border border-slate-600/50 rounded-xl overflow-hidden flex flex-col">
        {/* Subtle patterned design inside */}
        <div className="flex-1 border-b border-slate-900 bg-slate-800/50"></div>
        <div className="flex-1 bg-slate-950/80"></div>
      </div>
      <span className="relative z-10 text-white/50 text-[10px] font-bold font-sans tracking-widest">{count} CARDS</span>
    </button>
  );
}

// ─── OpponentPanel ────────────────────────────────────────────────────────────
// This component is no longer used as its logic has been integrated directly into the main render.
// function OpponentPanel({ player, cardCount, isCurrentTurn, hasMelded }) {
//   return (
//     <div className={[
//       'flex flex-col items-center gap-1 px-3 py-2 rounded-xl modern-glass transition-all',
//       isCurrentTurn ? 'ring-2 ring-[var(--color-gold)] shadow-[0_0_16px_rgba(212,168,67,0.3)]' : '',
//     ].join(' ')}>
//       {isCurrentTurn && (
//         <span className="text-[var(--color-gold)] text-[9px] uppercase tracking-widest animate-pulse">
//           ↓ Playing
//         </span>
//       )}
//       <div className="flex -space-x-2.5">
//         {Array.from({ length: Math.min(cardCount, 6) }).map((_, i) => (
//           <div key={i} className="w-5 h-8 rounded bg-gradient-to-br from-[#1a3a5c] to-[#0e1f30] border border-white/20"
//             style={{ transform: `rotate(${(i - 2.5) * 5}deg)` }} />
//         ))}
//       </div>
//       <p className="text-white/80 text-xs font-medium truncate max-w-[80px]">{player.name}</p>
//       <div className="flex items-center gap-1.5">
//         <span className="text-white/40 text-[10px]">{cardCount} cards</span>
//         {hasMelded && <span className="text-emerald-400 text-[10px]">✓ Open</span>}
//       </div>
//     </div>
//   );
// }

// ─── TableMeld ────────────────────────────────────────────────────────────────
/** Displays one meld group on the table. Glows green when a card can be added. */
function TableMeld({ cards, onClick, canAdd, isTarkibMode }) {
  return (
    <div
      onClick={onClick}
      className={[
        'flex gap-2 p-3 rounded-2xl border transition-all',
        'bg-white/5 backdrop-blur-md shadow-lg',
        isTarkibMode
          ? canAdd
            ? 'border-emerald-400 bg-emerald-900/30 cursor-pointer shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:scale-105 hover:z-20'
            : 'border-white/10 opacity-50 cursor-not-allowed'
          : 'border-white/10',
      ].join(' ')}
    >
      <div className="flex gap-1.5 pointer-events-none">
        {cards.map(card => (
          <motion.div layout layoutId={card.id} key={card.id}>
            <PlayingCard card={card} small disabled />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── PendingGroup ─────────────────────────────────────────────────────────────
/** Shows a staged meld group waiting to be submitted. */
function PendingGroup({ cards, pts, onRemove, valid }) {
  return (
    <div className={[
      'flex items-center gap-1.5 p-1.5 rounded-lg border',
      valid ? 'border-emerald-500/40 bg-emerald-900/10' : 'border-red-500/40 bg-red-900/10',
    ].join(' ')}>
      <div className="flex gap-0.5">
        {cards.map(card => (
          <motion.div layout layoutId={card.id} key={card.id}>
            <PlayingCard card={card} small disabled />
          </motion.div>
        ))}
      </div>
      <div className="flex flex-col items-end gap-1 ml-1">
        <span className={`text-[10px] font-bold ${valid ? 'text-emerald-400' : 'text-red-400'}`}>
          {pts} pts
        </span>
        <button
          onClick={onRemove}
          className="text-white/30 hover:text-red-400 text-xs leading-none cursor-pointer"
          title="Remove group"
        >✕</button>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function GameBoard({ roomId, playerId, onLeave }) {
  // ── Live room state ────────────────────────────────────────────────────────
  const [room, setRoom]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // ── Turn-local state ───────────────────────────────────────────────────────
  const [hasDrawn, setHasDrawn]           = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Meld staging state ─────────────────────────────────────────────────────
  // IDs of hand cards currently selected (highlighted in gold)
  const [selectedIds, setSelectedIds]     = useState(new Set());
  // Groups the user has staged for a single "Lay Down" action
  const [pendingGroups, setPendingGroups] = useState([]);
  // Feedback messages
  const [meldMsg, setMeldMsg]             = useState({ text: '', ok: true });
  // Drag and drop state for manually rearranging hand
  const [dragId, setDragId]               = useState(null);
  // Highlight newly drawn card
  const [drawnCardId, setDrawnCardId]     = useState(null);

  // ── Firestore real-time listener ───────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    return onSnapshot(doc(db, 'gameRooms', roomId), snap => {
      if (snap.exists()) setRoom(snap.data());
      setLoading(false);
    }, err => { setError('Connection lost: ' + err.message); setLoading(false); });
  }, [roomId]);

  // Reset turn-local state when turn changes
  // AND bypassed drawing if the current player starts with 15 cards.
  useEffect(() => {
    const defaultHasDrawn = room?.hands?.[room?.currentTurnId]?.length >= 15;
    setHasDrawn(defaultHasDrawn);
    setSelectedIds(new Set());
    setMeldMsg({ text: '', ok: true });
    setDrawnCardId(null);
  }, [room?.currentTurnId]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const isMyTurn    = room?.currentTurnId === playerId;
  const myHand      = room?.hands?.[playerId]   ?? [];
  const drawPile    = room?.drawPile             ?? [];
  const discardPile = room?.discardPile          ?? [];
  const topDiscard  = discardPile[discardPile.length - 1] ?? null;
  const players     = room?.players             ?? [];
  const opponents   = players.filter(p => p.id !== playerId);
  const me          = players.find(p => p.id === playerId);
  const tableMelds  = room?.tableMelds           ?? [];
  const hasMelded   = room?.hasMelded?.[playerId] ?? false;

  // IDs of all cards currently in pending groups (can't re-select them)
  const pendingIds  = new Set(pendingGroups.flat().map(c => c.id));
  // Cards available to select (not yet grouped)
  const availableHand = myHand.filter(c => !pendingIds.has(c.id));
  const selectedCards = availableHand.filter(c => selectedIds.has(c.id));

  // Tarkib mode: player has already melded AND has exactly 1 card selected
  const isTarkibMode = hasMelded && selectedIds.size === 1 && hasDrawn;
  const tarkibCard   = isTarkibMode
    ? myHand.find(c => selectedIds.has(c.id))
    : null;

  // Next player ID for turn rotation
  function nextPlayerId() {
    const idx = players.findIndex(p => p.id === playerId);
    return players[(idx + 1) % players.length].id;
  }

  // ── Handler: Toggle card selection ────────────────────────────────────────
  const toggleCard = useCallback((cardId) => {
    if (!isMyTurn || !hasDrawn) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
    setMeldMsg({ text: '', ok: true });
  }, [isMyTurn, hasDrawn]);

  // ── Hand Drag & Drop ───────────────────────────────────────────────────────
  const handleDragStart = (e, cardId) => {
    setDragId(cardId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, targetCardId) => {
    e.preventDefault();
    if (!dragId || dragId === targetCardId) return;

    const dragIdx = myHand.findIndex(c => c.id === dragId);
    const dropIdx = myHand.findIndex(c => c.id === targetCardId);
    if (dragIdx < 0 || dropIdx < 0) return;

    const newHand = [...myHand];
    const [removed] = newHand.splice(dragIdx, 1);
    newHand.splice(dropIdx, 0, removed);

    try {
      await updateDoc(doc(db, 'gameRooms', roomId), {
        [`hands.${playerId}`]: newHand
      });
      playCardSnap();
    } catch (err) { console.error('Drag drop failed:', err); }
    setDragId(null);
  };

  // ── Auto-Arrange Hand ──────────────────────────────────────────────────────
  const handleAutoArrange = async () => {
    if (actionLoading || myHand.length < 2) return;
    const suitWeight = { hearts: 1, clubs: 2, diamonds: 3, spades: 4, joker: 5 };
    const sortedHand = [...myHand].sort((a, b) => {
      if (suitWeight[a.suit] !== suitWeight[b.suit]) {
        return suitWeight[a.suit] - suitWeight[b.suit];
      }
      return rankOrder(a.rank) - rankOrder(b.rank);
    });

    try {
      await updateDoc(doc(db, 'gameRooms', roomId), {
        [`hands.${playerId}`]: sortedHand
      });
      playCardSnap();
    } catch (err) { console.error('Arrange failed:', err); }
  };

  // ── Cheat Mode ─────────────────────────────────────────────────────────────
  const cheatTimerRef = useRef(null);
  
  const handleDrawJokerCheat = useCallback(async () => {
    if (!isMyTurn || hasDrawn || actionLoading) return;
    setActionLoading(true); setError('');
    try {
      const jokerCard = {
        id: `cheat_joker_${Date.now()}`,
        suit: 'joker',
        rank: 'joker',
        value: 0
      };
      const newHand = [...myHand, jokerCard];
      await updateDoc(doc(db, 'gameRooms', roomId), {
        [`hands.${playerId}`]: newHand
      });
      setHasDrawn(true);
      setDrawnCardId(jokerCard.id);
      setMeldMsg({ text: 'Cheat used: Drew a hidden Joker!', ok: true });
    } catch (err) { setError('Cheat failed: ' + err.message); }
    finally { setActionLoading(false); }
  }, [isMyTurn, hasDrawn, actionLoading, myHand, playerId, roomId]);

  const startCheat = () => {
    if (!isMyTurn || hasDrawn) return;
    cheatTimerRef.current = setTimeout(() => {
      handleDrawJokerCheat();
    }, 5000); // 5 seconds
  };
  const cancelCheat = () => {
    if (cheatTimerRef.current) clearTimeout(cheatTimerRef.current);
  };

  // ── Handler: Draw ──────────────────────────────────────────────────────────
  const handleDraw = useCallback(async (source) => {
    if (!isMyTurn || hasDrawn || actionLoading) return;
    if (source === 'drawPile'    && drawPile.length    === 0) { setError('Draw pile empty!'); return; }
    if (source === 'discardPile' && discardPile.length === 0) { setError('Discard pile empty!'); return; }
    setActionLoading(true); setError('');

    try {
      let card;
      const newDraw    = [...drawPile];
      const newDiscard = [...discardPile];
      const newHand    = [...myHand];

      if (source === 'drawPile') { card = newDraw.shift(); }
      else                       { card = newDiscard.pop(); }
      newHand.push(card);

      await updateDoc(doc(db, 'gameRooms', roomId), {
        [`hands.${playerId}`]: newHand,
        drawPile:              newDraw,
        discardPile:           newDiscard,
      });
      setHasDrawn(true);
      setDrawnCardId(card.id);
      playDraw();
    } catch (err) { setError('Draw failed: ' + err.message); }
    finally { setActionLoading(false); }
  }, [isMyTurn, hasDrawn, actionLoading, drawPile, discardPile, myHand, playerId, roomId]);

  // ── Handler: Group Selected ────────────────────────────────────────────────
  const handleGroupSelected = useCallback(() => {
    if (selectedCards.length < 3) {
      setMeldMsg({ text: 'Select at least 3 cards to form a group.', ok: false });
      return;
    }
    const isSet = isValidSet(selectedCards);
    const isRun = isValidRun(selectedCards);
    if (!isSet && !isRun) {
      setMeldMsg({ text: 'Selected cards don\'t form a valid set or run.', ok: false });
      return;
    }
    setPendingGroups(prev => [...prev, selectedCards]);
    setSelectedIds(new Set());
    setMeldMsg({ text: `Group added! (${isRun ? 'Run' : 'Set'})`, ok: true });
    playCardSnap();
  }, [selectedCards]);

  // ── Handler: Remove a pending group ───────────────────────────────────────
  const handleRemoveGroup = useCallback((idx) => {
    setPendingGroups(prev => prev.filter((_, i) => i !== idx));
    setMeldMsg({ text: '', ok: true });
  }, []);

  // ── Handler: Lay Down (initial meld) ──────────────────────────────────────
  const handleLayDown = useCallback(async () => {
    if (pendingGroups.length === 0) {
      setMeldMsg({ text: 'Stage at least one group first.', ok: false });
      return;
    }

    if (!hasMelded) {
      const result = validateInitialMeld(pendingGroups);
      if (!result.valid) {
        setMeldMsg({ text: result.reason, ok: false });
        return;
      }

      if (room?.isKhabithaMode) {
        const stagedPts = pendingGroups.reduce((sum, g) => sum + calculatePoints(g), 0);
        if ((room?.highestMeldPoints || 0) > 0 && stagedPts < room.highestMeldPoints) {
          setMeldMsg({ text: `🔥 الخبيثة: You must meld at least ${room.highestMeldPoints} points!`, ok: false });
          return;
        }
      }
    } else {
      for (const group of pendingGroups) {
        if (!isValidSet(group) && !isValidRun(group)) {
          setMeldMsg({ text: 'One of the staged groups is invalid.', ok: false });
          return;
        }
      }
    }
    
    setActionLoading(true); setMeldMsg({ text: '', ok: true });

    try {
      const laidIds    = new Set(pendingGroups.flat().map(c => c.id));
      const newHand    = myHand.filter(c => !laidIds.has(c.id));

      if (newHand.length === 0) {
        setMeldMsg({ text: 'You must keep at least 1 card to discard and win!', ok: false });
        return;
      }

      // Firestore does not support nested arrays, so we map groups to objects
      const formattedGroups = pendingGroups.map(group => ({ cards: sortMeld(group) }));
      const newMelds   = [...tableMelds, ...formattedGroups];

      const updateData = {
        [`hands.${playerId}`]:    newHand,
        tableMelds:               newMelds,
        [`hasMelded.${playerId}`]: true,
      };

      if (!hasMelded && room?.isKhabithaMode) {
        const stagedPts = pendingGroups.reduce((sum, g) => sum + calculatePoints(g), 0);
        updateData.highestMeldPoints = Math.max(stagedPts, room?.highestMeldPoints || 0);
      }

      await updateDoc(doc(db, 'gameRooms', roomId), updateData);
      setPendingGroups([]);
      setSelectedIds(new Set());
      setMeldMsg({ text: `✓ Melded successfully!`, ok: true });
      playCardSnap();
    } catch (err) {
      setMeldMsg({ text: 'Meld failed: ' + err.message, ok: false });
    } finally { setActionLoading(false); }
  }, [pendingGroups, myHand, tableMelds, playerId, roomId, hasMelded]);

  // ── Handler: Add to existing meld (Tarkib — تركيب) & Joker Swapping ───────
  const handleTarkib = useCallback(async (meldIdx) => {
    if (!tarkibCard || !isTarkibMode || actionLoading) return;
    const targetMeld = tableMelds[meldIdx];

    let swappedJoker = null;
    let newMeldCards = null;

    // 1. Check if we can STEAL a Joker by replacing it
    const jokerIndex = targetMeld.cards.findIndex(isJoker);
    if (jokerIndex !== -1 && !isJoker(tarkibCard)) {
      const testCards = [...targetMeld.cards];
      testCards.splice(jokerIndex, 1, tarkibCard); // replace joker with dragged card
      
      const isSet = isValidSet(testCards);
      const isRun = isValidRun(testCards);

      // Custom Rule: You can only steal a Joker from a SET if you are completing it to 4 cards.
      // If it's only a 3-card set, you cannot steal the Joker (it falls through to standard append).
      const allowSetSteal = isSet && testCards.length === 4;
      const allowRunSteal = isRun;

      if (allowSetSteal || allowRunSteal) {
        swappedJoker = targetMeld.cards[jokerIndex];
        newMeldCards = sortMeld(testCards);
      }
    }

    // 2. If we didn't swap a Joker, try standard Tarkib append
    if (!swappedJoker) {
      if (!canAddToMeld(tarkibCard, targetMeld.cards)) {
        setMeldMsg({ text: 'That card can\'t extend this meld.', ok: false });
        return;
      }
      newMeldCards = sortMeld([...targetMeld.cards, tarkibCard]);
    }

    setActionLoading(true); setMeldMsg({ text: '', ok: true });

    try {
      let newHand = myHand.filter(c => c.id !== tarkibCard.id);
      
      // If we swapped a Joker, add it to our hand!
      if (swappedJoker) {
        newHand.push(swappedJoker);
      }

      if (newHand.length === 0) {
        setMeldMsg({ text: 'You must keep at least 1 card to discard and win!', ok: false });
        if (swappedJoker) return; // Important to block win condition rules
      }

      const newMelds = tableMelds.map((m, i) =>
        i === meldIdx ? { cards: newMeldCards } : m
      );

      await updateDoc(doc(db, 'gameRooms', roomId), {
        [`hands.${playerId}`]: newHand,
        tableMelds:            newMelds,
      });
      setSelectedIds(new Set());
      setMeldMsg({ text: swappedJoker ? '✨ Swapped and stole a Joker!' : '✓ Card added to meld!', ok: true });
      playCardSnap();
    } catch (err) {
      setMeldMsg({ text: 'Tarkib failed: ' + err.message, ok: false });
    } finally { setActionLoading(false); }
  }, [tarkibCard, isTarkibMode, tableMelds, myHand, playerId, roomId, actionLoading]);

  // ── Handler: Discard ───────────────────────────────────────────────────────
  const handleDiscard = useCallback(async (cardId) => {
    if (!isMyTurn || !hasDrawn || actionLoading) return;
    setActionLoading(true); setError('');

    try {
      const card       = myHand.find(c => c.id === cardId);
      if (!card) return;
      const newHand    = myHand.filter(c => c.id !== cardId);
      const newDiscard = [...discardPile, card];

      if (newHand.length === 0) {
        // WIN DETECTION: Player has exactly 0 cards after discarding
        const scores = calculateRoundScores(room, playerId);
        await updateDoc(doc(db, 'gameRooms', roomId), {
          [`hands.${playerId}`]: newHand,
          discardPile:           newDiscard,
          status:                'finished',
          winnerId:              playerId,
          roundScores:           scores,
          currentTurnId:         null
        });
      } else {
        await updateDoc(doc(db, 'gameRooms', roomId), {
          [`hands.${playerId}`]: newHand,
          discardPile:           newDiscard,
          currentTurnId:         nextPlayerId(),
        });
      }
      setSelectedIds(new Set());
      playCardSnap();
    } catch (err) { setError('Discard failed: ' + err.message); }
    finally { setActionLoading(false); }
  }, [isMyTurn, hasDrawn, actionLoading, pendingGroups, myHand, discardPile, playerId, roomId, players, room]);

  // ── Handler: Send Emoji ────────────────────────────────────────────────────
  const handleSendEmoji = useCallback(async (emoji) => {
    if (actionLoading) return;
    try {
      const newEmoji = { id: Date.now().toString() + Math.random(), emoji, senderId: playerId, timestamp: Date.now() };
      const currentEmojis = room?.emojis ?? [];
      const updatedEmojis = [...currentEmojis, newEmoji].slice(-15);
      await updateDoc(doc(db, 'gameRooms', roomId), { emojis: updatedEmojis });
    } catch (err) { console.error('Emoji failed:', err); }
  }, [roomId, playerId, room, actionLoading]);

  // ─── Loading / Finished / Error States ──────────────────────────────────────
  if (!room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-red-400 gap-4">
        <p>Room not found or game has ended.</p>
        <button 
          onClick={onLeave}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer text-sm"
        >
          Return to Lobby
        </button>
      </div>
    );
  }
  
  if (room.status === 'finished') {
    const winner = players.find(p => p.id === room.winnerId);
    
    // Host action: Reset to waiting (goes to lobby where they can deal again)
    const handleReturnToLobby = async () => {
      try {
        if (me?.isHost) {
          await updateDoc(doc(db, 'gameRooms', roomId), { status: 'waiting' });
        }
        onLeave();
      } catch (err) { console.error('Failed to reset game:', err); }
    };

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center select-none bg-[var(--color-bg)]">
        <div className="w-full max-w-sm modern-glass p-8 rounded-3xl border border-[var(--color-gold)]/50 shadow-[0_0_40px_rgba(212,168,67,0.2)]">
          {(() => { playChime(); return null; })()}
          <h1 className="text-4xl text-[var(--color-gold)] font-[var(--font-display)] tracking-wider mb-2">Round Over!</h1>
          <p className="text-emerald-400 font-medium text-lg mb-8">🎉 {winner?.name || 'Someone'} won the round! 🎉</p>
          
          <div className="space-y-4 mb-10 w-full text-left">
            <p className="text-white/40 text-xs uppercase tracking-widest border-b border-white/10 pb-2">Penalty Scores</p>
            {players.map(p => {
              const score = room.roundScores?.[p.id] ?? 0;
              const isMe  = p.id === playerId;
              return (
                <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg ${isMe ? 'bg-white/10 border border-white/20' : 'bg-black/20'}`}>
                  <span className="text-white/80 font-medium">{p.name} {p.id === room.winnerId && '👑'}</span>
                  <span className={`font-mono font-bold ${score === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {score === 0 ? 'Winner! (0)' : `+${score}`}
                  </span>
                </div>
              );
            })}
          </div>

          <button 
            onClick={handleReturnToLobby}
            className="w-full btn-gold py-4 rounded-xl text-sm uppercase tracking-wide font-bold cursor-pointer hover:scale-[1.02] transition-transform"
          >
            {me?.isHost ? 'Return to Lobby to Play Again' : 'Return to Lobby'}
          </button>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
    </div>
  );


  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col select-none overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black font-sans text-slate-100">

      {/* ── TOP BAR ── */}
      <header className="shrink-0 flex items-center justify-between p-4 bg-white/5 backdrop-blur-md border-b border-white/10 sticky top-0 z-40 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-bold tracking-widest text-sm uppercase drop-shadow-md">{roomId}</span>
          <span className="text-white/20 text-xs hidden sm:inline">•</span>
          <span className="text-slate-300 text-xs font-medium tracking-wide hidden sm:inline">{drawPile.length} IN DECK</span>
          {room?.isKhabithaMode && (
            <span className="ml-[1px] sm:ml-2 bg-red-900/40 border border-red-500/40 text-red-400 px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold tracking-widest uppercase shadow-[0_0_10px_rgba(239,68,68,0.2)]">
              🔥 Target: {room?.highestMeldPoints ? `${room.highestMeldPoints}+` : '51+'}
            </span>
          )}
        </div>
        <div className="flex gap-4 items-center relative z-50">
          {hasMelded && <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest">✓ Melded</span>}
          <div className="flex items-center gap-1 bg-white/5 rounded-full px-2 lg:px-3 py-1 mr-2 border border-white/10">
            {['😂', '😡', '👏', '🔥'].map(emoji => (
              <button 
                key={emoji} 
                onClick={() => handleSendEmoji(emoji)}
                className="hover:scale-125 hover:-translate-y-1 transition-all text-sm lg:text-lg cursor-pointer px-1 drop-shadow-md"
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${me?.name}`} alt="Avatar" className="w-8 h-8 rounded-full bg-white/10 border border-[var(--color-gold)] shadow-[0_0_10px_rgba(212,168,67,0.3)]" />
            <span className="text-slate-200 text-sm font-semibold truncate max-w-[120px]">
              <span className="opacity-50 mr-2 text-xs hidden sm:inline">YOU</span>{me?.name}
            </span>
          </div>
          <button 
            onClick={() => {
              if (window.confirm('Are you sure you want to quit the game? You will leave the room entirely.')) {
                onLeave();
              }
            }}
            className="text-white/40 hover:text-red-400 font-bold text-xs px-3 py-1.5 rounded-lg border border-transparent hover:border-red-500/30 hover:bg-red-500/10 transition-colors cursor-pointer uppercase tracking-widest"
          >
            Quit
          </button>
        </div>
      </header>

      {/* ── TOP: Opponents ── */}
      <div className="flex justify-center gap-8 p-6 bg-white/[0.02] border-b border-white/5 shadow-inner">
        {opponents.map(p => {
          const isCurr = room.currentTurnId === p.id;
          const displayCards = Math.min((room.hands?.[p.id] ?? []).length, 15); // visual cap
          return (
            <div key={p.id} className="flex flex-col items-center">
              <div className={['relative mb-2 rounded-full transition-all duration-300', isCurr ? 'ring-4 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)] scale-110' : 'ring-2 ring-white/10 opacity-60'].join(' ')}>
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`} alt="Avatar" className="w-12 h-12 rounded-full bg-white/10" />
                {isCurr && <span className="absolute -bottom-2 -right-2 text-lg animate-bounce drop-shadow-md">⏳</span>}
              </div>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 transition-colors ${isCurr ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-slate-500'}`}>
                {p.name}
              </p>
              
              {/* Fan out opponent cards using absolute offsets */}
              <div className="relative mb-2" style={{ width: `${24 + displayCards * 6}px`, height: '48px' }}>
                {Array.from({ length: displayCards }).map((_, i) => (
                  <div key={i} className="absolute top-0 w-8 h-12 rounded bg-gradient-to-br from-slate-200 to-slate-400 border border-slate-500 shadow-md transform hover:-translate-y-2 transition-transform"
                       style={{ left: `${i * 6}px`, zIndex: i }} />
                ))}
                <div className="absolute -bottom-6 w-full text-center text-[10px] text-slate-500 font-bold tracking-widest">
                  {(room.hands?.[p.id] ?? []).length} CARDS
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── TABLE MELDS ── */}
      {tableMelds.length > 0 && (
        <div className="mx-4 mb-2">
          <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1.5">
            {isTarkibMode
              ? '🟢 Tarkib mode — click a meld to add your card'
              : 'Table Melds'}
          </p>
          <div className="flex flex-wrap gap-2">
            {tableMelds.map((meld, idx) => (
              <TableMeld
                key={idx}
                cards={meld.cards}
                onClick={() => isTarkibMode && handleTarkib(idx)}
                canAdd={isTarkibMode && tarkibCard ? canAddToMeld(tarkibCard, meld.cards) : false}
                isTarkibMode={isTarkibMode}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── CENTER: PILES ── */}
      <div className="flex-1 flex items-center justify-center gap-10 px-4">
        {/* Draw pile */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-white/40 text-[10px] uppercase tracking-widest">Draw Pile</p>
          {drawPile.length > 0
            ? <CardBack 
                onClick={() => handleDraw('drawPile')} 
                onPointerDown={startCheat}
                onPointerUp={cancelCheat}
                onPointerLeave={cancelCheat}
                onContextMenu={e => e.preventDefault()}
                count={drawPile.length}
                pulsing={isMyTurn && !hasDrawn} label="Draw from deck"
                disabled={!isMyTurn || hasDrawn || actionLoading} 
              />
            : <div className="w-16 sm:w-24 aspect-[2.5/3.5] rounded-xl sm:rounded-2xl border-2 border-dashed border-slate-600 bg-white/5 flex items-center justify-center">
                <span className="text-slate-500 text-[10px] font-bold tracking-widest">EMPTY</span>
              </div>
          }
        </div>

        {/* Direction arrow */}
        {isMyTurn && (
          <div className="text-[var(--color-gold)] text-2xl">
            {!hasDrawn ? '↕' : '✓'}
          </div>
        )}

        {/* Discard pile */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-white/40 text-[10px] uppercase tracking-widest">Discard</p>
          {topDiscard
            ? <div className="relative">
                {discardPile.length > 1 &&
                  <div className="absolute top-1 left-1 w-16 sm:w-24 aspect-[2.5/3.5] rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 shadow-md" />}
                <motion.div layout layoutId={topDiscard.id}>
                  <PlayingCard card={topDiscard}
                    onClick={() => handleDraw('discardPile')}
                    disabled={!isMyTurn || hasDrawn || actionLoading} />
                </motion.div>
              </div>
            : <div className="w-16 sm:w-24 aspect-[2.5/3.5] rounded-xl sm:rounded-2xl border-2 border-dashed border-slate-600 bg-white/5 flex items-center justify-center">
                <span className="text-slate-500 text-[10px] font-bold tracking-widest">EMPTY</span>
              </div>
          }
          {discardPile.length > 1 && <p className="text-white/30 text-[10px] uppercase font-bold tracking-wide mt-1">{discardPile.length} CARDS</p>}
        </div>
      </div>

      {/* ── STATUS / MELD CONTROLS ── */}
      {isMyTurn && hasDrawn && (
        <div className="mx-4 mb-2">
          {/* Pending groups */}
          {pendingGroups.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingGroups.map((group, idx) => {
                const isSet = isValidSet(group), isRun = isValidRun(group);
                const pts   = isSet || isRun ? calculatePoints(group) : 0;
                return (
                  <PendingGroup key={idx} cards={group} pts={pts}
                    valid={isSet || isRun} onRemove={() => handleRemoveGroup(idx)} />
                );
              })}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Group Selected */}
            {selectedCards.length >= 3 && (
              <button onClick={handleGroupSelected} disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-all cursor-pointer border border-emerald-500/30">
                ＋ Group Selected ({selectedCards.length})
              </button>
            )}

            {/* Lay Down */}
            {pendingGroups.length > 0 && (
              <button onClick={handleLayDown} disabled={actionLoading}
                className="px-6 py-2 rounded-xl text-xs font-bold cursor-pointer uppercase tracking-widest bg-emerald-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.4)] hover:-translate-y-1 transition-all">
                {actionLoading ? 'LAYING DOWN…' : 'LAY DOWN'}
              </button>
            )}

            {/* Tarkib hint */}
            {hasMelded && selectedIds.size === 1 && (
              <div className="px-3 py-2 rounded-lg text-xs bg-emerald-900/20 border border-emerald-500/30 text-emerald-300">
                🟢 Tarkib mode — click a green meld on the table to add your card
              </div>
            )}

            {/* Discard selected card */}
            {selectedIds.size === 1 && (
              <button onClick={() => handleDiscard([...selectedIds][0])} disabled={actionLoading}
                className="px-6 py-3 rounded-lg text-sm font-bold bg-red-900/60 hover:bg-red-900 text-red-100 border-2 border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.4)] transition-all cursor-pointer uppercase tracking-widest">
                ⬇ Discard Card
              </button>
            )}
          </div>

          {/* Meld feedback */}
          {meldMsg.text && (
            <p className={`mt-2 text-xs ${meldMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {meldMsg.text}
            </p>
          )}
        </div>
      )}

      {/* ── GLOBAL STATUS BAR ── */}
      <div className={[
        'mx-4 mb-3 px-5 py-3 rounded-2xl text-xs font-bold tracking-widest uppercase text-center',
        isMyTurn
          ? 'bg-emerald-900/30 border border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
          : 'bg-white/5 backdrop-blur-md border border-white/10 text-white/50 shadow-lg',
      ].join(' ')}>
        {error || (() => {
          if (!isMyTurn) {
            const curr = players.find(p => p.id === room.currentTurnId);
            return `WAITING FOR ${curr?.name ?? '…'}`;
          }
          if (!hasDrawn) return 'YOUR TURN — DRAW A CARD TO BEGIN';
          if (pendingGroups.length > 0) return `${pendingGroups.length} GROUP(S) STAGED — TAP "LAY DOWN" TO SUBMIT`;
          if (!hasMelded && pendingGroups.length === 0) return 'SELECT CARDS THEN TAP "GROUP SELECTED"';
          if (hasMelded && selectedIds.size === 0) return 'CREATE NEW MELDS OR SELECT 1 CARD TO TARKIB/DISCARD';
          return '';
        })()}
      </div>

      {/* ── MY HAND ── */}
      <div className="shrink-0 pb-6 pt-2 px-4 border-t border-white/5 bg-slate-900/50 backdrop-blur-lg">
        <div className="flex justify-between items-center mb-4 px-2">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
            YOUR HAND <span className="text-white ml-2">{myHand.length} CARDS</span>
            {pendingGroups.length > 0 && (
              <span className="ml-2 text-emerald-400">
                ({pendingGroups.flat().length} STAGED)
              </span>
            )}
          </p>
          <button 
            onClick={handleAutoArrange}
            disabled={actionLoading}
            className="text-white/60 hover:text-white text-[10px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/30 hover:bg-white/10 transition-all cursor-pointer bg-white/5 shadow-md"
            title="Sort cards by suit and rank"
          >
            Sort Cards
          </button>
        </div>

        {/* Flawless Matrix Grid Fan: Exactly 5 cards per row */}
        <div className="w-full pb-8 pt-6 px-1 sm:px-4 flex flex-col justify-center items-center overflow-hidden min-h-[300px]">
          
          {/* Cards in pending groups (dimmed) */}
          {myHand.filter(c => pendingIds.has(c.id)).length > 0 && (
            <div className="flex justify-center gap-1 sm:gap-2 mb-4 shrink-0 flex-wrap w-full">
              {myHand.filter(c => pendingIds.has(c.id)).map(card => (
                <motion.div layout layoutId={card.id} key={card.id} className="opacity-30 shrink-0">
                  <PlayingCard card={card} disabled />
                </motion.div>
              ))}
            </div>
          )}

          {/* Available cards - Grid Matrix layout */}
          <div className="flex flex-col gap-2 sm:gap-4 w-full items-center">
            {Array.from({ length: Math.ceil(availableHand.length / 5) }).map((_, rowIdx) => {
              const rowCards = availableHand.slice(rowIdx * 5, rowIdx * 5 + 5);
              return (
                <div key={rowIdx} className="flex justify-center gap-1 sm:gap-3 w-full shrink-0">
                  {rowCards.map((card) => (
                    <motion.div
                      layout
                      layoutId={card.id}
                      key={card.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, card.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDrop(e, card.id)}
                      className={[
                        'transition-all duration-300 group',
                        dragId === card.id ? 'opacity-50 scale-95' : 'hover:-translate-y-4 hover:scale-105 hover:z-50 hover:shadow-[0_15px_30px_rgba(52,211,153,0.3)]'
                      ].join(' ')}
                    >
                      <PlayingCard
                        card={card}
                        selected={selectedIds.has(card.id)}
                        highlight={isTarkibMode && !selectedIds.has(card.id)}
                        isNew={drawnCardId === card.id}
                        onClick={() => toggleCard(card.id)}
                        disabled={!isMyTurn || !hasDrawn || actionLoading}
                      />
                    </motion.div>
                  ))}
                </div>
              );
            })}
            
            {myHand.length === 0 && (
              <div className="flex items-center justify-center p-8">
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">NO CARDS IN HAND</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── LIVE EMOJIS OVERLAY ── */}
      <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
        <AnimatePresence>
          {(room?.emojis ?? []).filter(e => Date.now() - e.timestamp < 3500).map(e => {
            const isMe = e.senderId === playerId;
            const xOffset = isMe ? '25%' : `${35 + Math.random() * 40}%`;
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, scale: 0.5, y: isMe ? "0vh" : "0vh" }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 2.5, 2.5, 1], y: isMe ? "-50vh" : "50vh" }}
                transition={{ duration: 3.5, ease: "easeOut" }}
                className="absolute text-6xl drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                style={{
                  left: xOffset,
                  [isMe ? 'bottom' : 'top']: '10%'
                }}
              >
                {e.emoji}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

    </div>
  );
}
