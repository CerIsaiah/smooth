"use client";
import { useEffect } from "react";

/**
 * Updates the "N users swiping" indicator in the hero section on a random
 * cadence. Purely cosmetic social proof — no state, DOM-only.
 */
export function useOnlineUsers() {
  useEffect(() => {
    const updateOnlineUsers = () => {
      const randomUsers = Math.floor(Math.random() * (32 - 14 + 1)) + 14;
      const element = document.getElementById('online-users');
      if (element) {
        element.textContent = `${randomUsers} users swiping`;
      }
    };

    // Update initially
    updateOnlineUsers();

    // Update every 20-39 seconds
    const interval = setInterval(() => {
      const randomDelay = Math.floor(Math.random() * (39000 - 20000 + 1)) + 20000;
      setTimeout(updateOnlineUsers, randomDelay);
    }, 15000);

    return () => clearInterval(interval);
  }, []);
}
