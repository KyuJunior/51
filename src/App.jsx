// src/App.jsx
// ─────────────────────────────────────────────────────────────
// Root application component.
//
// Phase routing:
//   'lobby'   → Lobby (create / join room, wait for players)
//   'playing' → GameBoard (the actual card game)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';

export default function App() {
  // Extract room code from URL (e.g., https://game.com/A3K9Z -> "A3K9Z")
  const urlPath = window.location.pathname.replace('/', '').toUpperCase().trim();
  const initialJoinCode = urlPath.length === 5 ? urlPath : '';

  // Load session from localStorage if it exists so refreshes don't kill the game
  const [phase, setPhase] = useState(() => {
    const savedCode = localStorage.getItem('rummy_roomId');
    if (initialJoinCode && savedCode !== initialJoinCode) return 'lobby'; // prioritize the new link
    return localStorage.getItem('rummy_phase') || 'lobby';
  });
  
  const [roomId, setRoomId] = useState(() => {
    const savedCode = localStorage.getItem('rummy_roomId');
    if (initialJoinCode && savedCode !== initialJoinCode) {
      // Clear out the conflicting session so they can securely join the new room via URL
      localStorage.removeItem('rummy_phase');
      localStorage.removeItem('rummy_roomId');
      return null;
    }
    return savedCode || null;
  });
  
  // Track auth state so we don't render GameBoard before Firebase restores the UID
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthReady(true);
      } else {
        // If not logged in anonymously, do it now.
        signInAnonymously(auth).catch(err => {
          console.error('Anonymous auth failed:', err);
        });
      }
    });
    return unsub;
  }, []);

  /**
   * Called by <Lobby> when room status changes to 'playing'.
   */
  const handleGameStart = (roomData) => {
    localStorage.setItem('rummy_roomId', roomData.roomId);
    localStorage.setItem('rummy_phase', 'playing');
    setRoomId(roomData.roomId);
    setPhase('playing');
  };

  /**
   * Return from game back to lobby and clear the session.
   * This is triggered by a manual "Quit" action.
   */
  const handleLeave = () => {
    localStorage.removeItem('rummy_roomId');
    localStorage.removeItem('rummy_phase');
    setRoomId(null);
    setPhase('lobby');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09111e]">
        <div className="w-10 h-10 border-4 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Lobby ──────────────────────────────────────────────────
  if (phase === 'lobby') {
    return <Lobby onGameStart={handleGameStart} initialJoinCode={initialJoinCode} />;
  }

  // ── Game Board ─────────────────────────────────────────────
  return (
    <GameBoard
      roomId={roomId}
      playerId={auth.currentUser?.uid}
      onLeave={handleLeave}
    />
  );
}
