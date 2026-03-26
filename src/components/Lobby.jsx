// src/components/Lobby.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Lobby for the Iraqi "51" card game.
//
// Responsibilities:
//  • Anonymous Firebase Auth on mount
//  • Player name input
//  • Create Room  → writes a new Firestore game-room doc, user becomes host
//  • Join Room    → validates room exists & is waiting, adds player to doc
//  • Real-time player list via onSnapshot
//  • Host-only "Start Game" button → changes status to 'playing'
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { generateDeck, shuffleDeck, dealCards } from '../gameLogic';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generates a random alphanumeric room code of the given length.
 * e.g. "A3K9Z"
 */
function generateRoomId(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ambiguous chars removed
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ── Note ─────────────────────────────────────────────────────────────────────
// Deck helpers are now imported from ../gameLogic.js (106-card double deck).

// ── Firestore Schema Reference ────────────────────────────────────────────────
/*
  Collection: "gameRooms"
  Document ID: roomId (e.g. "A3K9Z")

  {
    roomId:        string,          // same as doc ID
    createdAt:     Timestamp,
    status:        'waiting' | 'playing' | 'finished',
    currentTurnId: string | null,   // uid of the player whose turn it is
    players: [                      // ordered array of player objects
      {
        id:     string,             // Firebase Auth uid
        name:   string,             // display name chosen in lobby
        isHost: boolean,
      }
    ],
    deck:         Card[],           // draw pile (array of card objects)
    discardPile:  Card[],           // top-accessible discard stack
    tableMelds:   Meld[][],         // groups of valid sets/runs laid on table
                                    // e.g. [[{suit,rank,value}, ...], ...]
  }
*/

// ── Component ─────────────────────────────────────────────────────────────────

export default function Lobby({ onGameStart, initialJoinCode = '' }) {
  // ── Auth state ─────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode]     = useState(initialJoinCode);

  // ── Room state ─────────────────────────────────────────────────────────────
  const [roomId, setRoomId]         = useState(null);   // current room
  const [roomData, setRoomData]     = useState(null);   // live snapshot
  const [isHost, setIsHost]         = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // ── Effect: Anonymous sign-in ──────────────────────────────────────────────
  useEffect(() => {
    // Listen for auth state changes; sign in anonymously if not logged in
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        try {
          const result = await signInAnonymously(auth);
          setUser(result.user);
        } catch (err) {
          setError('Authentication failed: ' + err.message);
        }
      }
      setAuthLoading(false);
    });

    return unsubscribe; // clean up listener on unmount
  }, []);

  // ── Effect: Real-time room listener ───────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'gameRooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRoomData(data);

        // If status flipped to 'playing', notify parent
        if (data.status === 'playing') {
          onGameStart?.(data);
        }
      }
    }, (err) => {
      setError('Lost connection to room: ' + err.message);
    });

    return unsubscribe;
  }, [roomId, onGameStart]);

  // ── Effect: Sync Room ID to URL ───────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (roomId) {
        window.history.replaceState(null, '', `/${roomId}`);
      } else {
        window.history.replaceState(null, '', '/');
      }
    }
  }, [roomId]);

  // ── Handler: Create Room ───────────────────────────────────────────────────
  const handleCreateRoom = useCallback(async () => {
    if (!playerName.trim()) { setError('Please enter your name first.'); return; }
    setError('');
    setLoading(true);

    try {
      const newRoomId = generateRoomId();
      const roomRef   = doc(db, 'gameRooms', newRoomId);

      const hostPlayer = {
        id:     user.uid,
        name:   playerName.trim(),
        isHost: true,
      };

      // Create the Firestore document (deck will be (re)generated on Start Game)
      await setDoc(roomRef, {
        roomId:        newRoomId,
        createdAt:     serverTimestamp(),
        status:        'waiting',
        currentTurnId: null,
        players:       [hostPlayer],
        hands:         {},          // populated when game starts
        drawPile:      [],
        discardPile:   [],
        tableMelds:    [],
      });

      setRoomId(newRoomId);
      setIsHost(true);
    } catch (err) {
      setError('Failed to create room: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [playerName, user]);

  // ── Handler: Join Room ─────────────────────────────────────────────────────
  const handleJoinRoom = useCallback(async () => {
    if (!playerName.trim()) { setError('Please enter your name first.'); return; }
    if (!joinCode.trim())   { setError('Please enter a room code.');    return; }
    setError('');
    setLoading(true);

    const code    = joinCode.trim().toUpperCase();
    const roomRef = doc(db, 'gameRooms', code);

    try {
      const snapshot = await getDoc(roomRef);

      // ── Validation ─────────────────────────────────────────────────────────
      if (!snapshot.exists()) {
        setError(`Room "${code}" does not exist.`);
        setLoading(false);
        return;
      }

      const data = snapshot.data();

      if (data.status !== 'waiting') {
        setError('This game has already started or finished.');
        setLoading(false);
        return;
      }

      if (data.players.length >= 4) {
        setError('This room is full (max 4 players).');
        setLoading(false);
        return;
      }

      // Check if user is already in the room (e.g., after a page refresh)
      const alreadyIn = data.players.some(p => p.id === user.uid);
      if (!alreadyIn) {
        const newPlayer = {
          id:     user.uid,
          name:   playerName.trim(),
          isHost: false,
        };

        await updateDoc(roomRef, {
          players: arrayUnion(newPlayer),
        });
      }

      setRoomId(code);
      // Determine host status (false for joiners)
      setIsHost(data.players.some(p => p.id === user.uid && p.isHost));
    } catch (err) {
      setError('Failed to join room: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [playerName, joinCode, user]);

  // ── Handler: Start Game (host only) ───────────────────────────────────────
  const handleStartGame = useCallback(async () => {
    if (!roomData || roomData.players.length < 2) {
      setError('Need at least 2 players to start.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const players = roomData.players;

      // 1. Generate and shuffle a fresh 106-card (2×52 + 2 Jokers) deck
      const freshDeck     = generateDeck();
      const shuffledDeck  = shuffleDeck(freshDeck);

      // 2. Deal cards:
      //    • Starting player (index 1, the one after the host) gets 15 cards
      //    • Everyone else gets 14 cards
      //    • Remainder becomes the draw pile
      const { hands, drawPile, discardPile } = dealCards(shuffledDeck, players);

      // 3. The starting player (index 1) goes first
      const startingPlayerId = players[1]?.id ?? players[0].id;

      // 4. Write everything to Firestore in a single atomic update
      const roomRef = doc(db, 'gameRooms', roomId);
      await updateDoc(roomRef, {
        status:        'playing',
        currentTurnId: startingPlayerId,
        hands,          // { [playerId]: Card[] }
        drawPile,       // Card[] (remaining ~50-60 cards)
        discardPile,    // [] — empty at game start
        tableMelds:    [],
        // Track which players have completed their first ≥51-pt meld
        hasMelded: Object.fromEntries(players.map(p => [p.id, false])),
        startedAt:     serverTimestamp(),
      });
      // onSnapshot will fire → onGameStart callback propagates to parent
    } catch (err) {
      setError('Failed to start game: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [roomId, roomData]);

  // ── Handler: Leave Room ───────────────────────────────────────────────────
  const handleLeaveRoom = useCallback(() => {
    setRoomId(null);
    setRoomData(null);
    setIsHost(false);
    setJoinCode('');
    setError('');
  }, []);

  // ── Handler: Share Link ───────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/${roomId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Game 51 - Multiplayer Rummy',
          text: 'Join my room to play Iraqi Rummy!',
          url: url,
        });
      } catch (err) {
        // Abort/cancel throws an error, we ignore it
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setError('✓ Invite link copied to clipboard!');
        setTimeout(() => setError(''), 3000);
      } catch (err) {
        setError('Failed to copy link.');
      }
    }
  }, [roomId]);

  // ─── Render helpers ────────────────────────────────────────────────────────

  /** Card suit color */
  const suitColor = (suit) =>
    suit === '♥' || suit === '♦' ? '#e05252' : '#e8dcc8';

  // ─── Loading skeleton ──────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--color-gold)] tracking-widest text-sm uppercase">
            Connecting…
          </p>
        </div>
      </div>
    );
  }

  // ─── Inside a room ─────────────────────────────────────────────────────────
  if (roomId && roomData) {
    const players = roomData.players ?? [];
    const myPlayer = players.find(p => p.id === user?.uid);

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md modern-glass rounded-2xl overflow-hidden">

          {/* Header */}
          <div className="bg-white/5 backdrop-blur-md px-6 pt-8 pb-6 text-center border-b border-white/10">
            <p className="text-[var(--color-gold)] text-xs uppercase tracking-[0.25em] mb-1">Room Code</p>
            <h1 className="text-5xl font-extrabold text-[var(--color-gold-light)] tracking-widest select-all">
              {roomId}
            </h1>
            <p className="text-white/60 text-[10px] mt-2 font-mono uppercase tracking-widest">Share this code to invite friends</p>
            <button 
              onClick={handleShare}
              className="mt-4 mx-auto px-5 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-xl text-emerald-400 font-bold text-xs uppercase tracking-widest transition-all hover:-translate-y-0.5 shadow-[0_4px_15px_rgba(16,185,129,0.2)] flex items-center gap-2 cursor-pointer"
            >
              <span>🔗</span> Share Invite Link
            </button>
          </div>

          {/* Players list */}
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="pulse-dot w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <p className="text-white/70 text-sm uppercase tracking-widest">
                Players ({players.length}/4)
              </p>
            </div>

            <ul className="space-y-2 mb-6">
              {players.map((p, idx) => (
                <li
                  key={p.id}
                  className="player-badge flex items-center gap-3 bg-white/5 hover:bg-white/10 transition-colors rounded-xl px-4 py-3"
                >
                  {/* Avatar circle */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: `hsl(${(idx * 83) % 360}, 55%, 45%)`,
                      color: '#fff',
                    }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {p.name}
                      {p.id === user?.uid && (
                        <span className="ml-2 text-[var(--color-gold)] text-xs">(You)</span>
                      )}
                    </p>
                    {p.isHost && (
                      <p className="text-[var(--color-gold)] text-xs">👑 Host</p>
                    )}
                  </div>

                  {/* Position indicator */}
                  <span className="text-white/30 text-xs">#{idx + 1}</span>
                </li>
              ))}

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
                <li
                  key={`empty-${i}`}
                  className="player-badge flex items-center gap-3 bg-white/[0.03] border border-dashed border-white/10 rounded-xl px-4 py-3"
                >
                  <div className="w-9 h-9 rounded-full bg-white/5 border border-dashed border-white/15 flex items-center justify-center shrink-0">
                    <span className="text-white/20 text-lg">?</span>
                  </div>
                  <p className="text-white/25 text-sm italic">Waiting for player…</p>
                </li>
              ))}
            </ul>

            {/* Error */}
            {error && (
              <div className="mb-4 bg-red-900/30 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            {/* Host: Start Game / Guest: waiting message */}
            {isHost ? (
              <button
                id="btn-start-game"
                onClick={handleStartGame}
                disabled={loading || players.length < 2}
                className="btn-premium w-full py-4 rounded-xl text-sm"
              >
                {loading ? 'INITIATING…' : players.length < 2
                  ? `WAITING FOR ${2 - players.length} MORE`
                  : 'START GAME'}
              </button>
            ) : (
              <div className="text-center py-3 text-white/50 text-sm italic animate-pulse">
                Waiting for the host to start the game…
              </div>
            )}

            {/* Leave button */}
            <button
              onClick={handleLeaveRoom}
              className="mt-3 w-full py-2.5 rounded-xl text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-all tracking-widest uppercase cursor-pointer"
            >
              ← Leave Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Pre-room: name + create/join ─────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md my-auto py-8">

        {/* Logo / title card */}
        <div className="text-center mb-10 animate-float">
          {/* Decorative suits */}
          <div className="flex justify-center gap-4 text-3xl mb-4 select-none opacity-80">
            {['♠', '♥', '♦', '♣'].map((s, i) => (
              <span
                key={s}
                className="drop-shadow-[0_4px_12px_rgba(255,255,255,0.2)]"
                style={{ color: suitColor(s), animationDelay: `${i * 0.1}s` }}
              >
                {s}
              </span>
            ))}
          </div>
          <h1 className="text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-yellow-100 via-yellow-400 to-yellow-600 drop-shadow-[0_4px_20px_rgba(246,211,101,0.5)] tracking-tighter mb-4">
            GAME 51
          </h1>
          <p className="text-[var(--color-gold)] font-bold text-xs tracking-[0.3em] uppercase opacity-80">
            Iraqi Rummy <span className="mx-2 opacity-50">•</span> Multiplayer
          </p>
        </div>

        {/* Main glass panel */}
        <div className="modern-glass rounded-3xl p-6 sm:p-8 flex flex-col gap-6 relative overflow-hidden">
          {/* Ambient inner glow */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--color-gold)]/30 to-transparent" />

          {/* Player name */}
          <div className="flex flex-col gap-2">
            <label htmlFor="input-player-name" className="text-[var(--color-gold)] font-bold text-[10px] uppercase tracking-widest ml-1">
              Your Display Name
            </label>
            <input
              id="input-player-name"
              type="text"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateRoom()}
              placeholder="e.g. Maverick"
              maxLength={20}
              className="input-premium w-full rounded-xl px-5 py-4 text-base font-medium"
            />
          </div>

          <div className="flex items-center gap-4 opacity-40">
            <div className="flex-1 h-px bg-current" />
            <span className="text-[10px] uppercase tracking-widest font-bold">Action</span>
            <div className="flex-1 h-px bg-current" />
          </div>

          {/* Create Room */}
          <button
            id="btn-create-room"
            onClick={handleCreateRoom}
            disabled={loading || !user}
            className="btn-premium w-full py-4 text-sm"
          >
            {loading ? 'CREATING…' : 'CREATE NEW ROOM'}
          </button>

          {/* OR divider */}
          <div className="flex items-center gap-4 opacity-30">
            <div className="flex-1 h-px bg-current" />
            <span className="text-[10px] uppercase tracking-widest font-bold">Or Join</span>
            <div className="flex-1 h-px bg-current" />
          </div>

          {/* Join Room */}
          <div className="flex gap-3">
            <input
              id="input-join-code"
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
              placeholder="CODE"
              maxLength={5}
              className="input-premium flex-1 rounded-xl px-5 py-4 text-base font-mono tracking-widest uppercase text-center"
            />
            <button
              id="btn-join-room"
              onClick={handleJoinRoom}
              disabled={loading || !user}
              className="btn-premium px-8 text-sm shrink-0"
            >
              JOIN
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-950/50 border border-red-500/50 text-red-200 text-sm font-medium rounded-xl px-4 py-3 animate-pulse">
              {error}
            </div>
          )}

          {/* Auth status */}
          <div className="pt-2 flex justify-center items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-yellow-500 animate-pulse'}`} />
            <span className="text-white/40 text-[10px] uppercase tracking-widest font-medium">
              {user ? `Connected Annonymously` : 'Tuning server connection…'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/20 text-xs mt-6 tracking-wider">
          2–4 players • Real-time multiplayer
        </p>
      </div>
    </div>
  );
}
