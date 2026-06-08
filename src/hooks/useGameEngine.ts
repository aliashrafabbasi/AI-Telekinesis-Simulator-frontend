import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  BATMAN_HIT,
  BOSS_JOKER_HIT,
  getPlayMargin,
  JOKER_HIT,
  NORMALS_BEFORE_BOSS,
  SPAWN_MS,
} from "../config/game";
import type { HandGesture, Point } from "../types/tracking";

export type JokerType = "normal" | "boss";

export type JokerEnemy = {
  id: number;
  x: number;
  y: number;
  speed: number;
  spin: number;
  slashed: boolean;
  slashTime: number;
  type: JokerType;
};

function hitRadius(joker: JokerEnemy, extreme: boolean): number {
  const jokerSize = joker.type === "boss" ? BOSS_JOKER_HIT : JOKER_HIT;

  if (joker.type === "boss") {
    if (!extreme) return Infinity;
    return BATMAN_HIT + jokerSize + 20;
  }

  const base = BATMAN_HIT + jokerSize - 10;
  return extreme ? base + 50 : base + 22;
}

function canSlash(joker: JokerEnemy, extreme: boolean): boolean {
  if (joker.type === "boss") return extreme;
  return true;
}

function spawnJoker(id: number, type: JokerType): JokerEnemy {
  const margin = getPlayMargin();
  const isBoss = type === "boss";

  return {
    id,
    x: margin + Math.random() * (window.innerWidth - margin * 2),
    y: isBoss ? -220 : -180,
    speed: isBoss ? 1.3 + Math.random() * 0.6 : 2.2 + Math.random() * 2.2,
    spin: Math.random() * 360,
    slashed: false,
    slashTime: 0,
    type,
  };
}

export function useGameEngine(
  active: boolean,
  batmanPosRef: RefObject<Point>,
  gesture: HandGesture,
) {
  const [jokers, setJokers] = useState<JokerEnemy[]>([]);
  const [normalScore, setNormalScore] = useState(0);
  const [bossScore, setBossScore] = useState(0);
  const [bossActive, setBossActive] = useState(false);
  const bossActiveRef = useRef(false);

  const jokersRef = useRef<JokerEnemy[]>([]);
  const nextIdRef = useRef(1);
  const lastSpawnRef = useRef(performance.now());
  const normalScoreRef = useRef(0);
  const bossScoreRef = useRef(0);
  const normalSpawnCountRef = useRef(0);
  const gestureRef = useRef(gesture);
  gestureRef.current = gesture;

  const syncJokersToReact = useCallback(() => {
    setJokers([...jokersRef.current]);
  }, []);

  useEffect(() => {
    if (!active) {
      jokersRef.current = [];
      bossActiveRef.current = false;
      setJokers([]);
      setBossActive(false);
      return;
    }

    lastSpawnRef.current = performance.now();
  }, [active]);

  const tick = useCallback(
    (time: number) => {
      if (!active) return;

      const batmanPos = batmanPosRef.current ?? { x: 0, y: 0 };
      let structureChanged = false;

      const bossOnScreen = jokersRef.current.some((j) => j.type === "boss" && !j.slashed);

      if (!bossOnScreen && time - lastSpawnRef.current > SPAWN_MS) {
        lastSpawnRef.current = time;
        structureChanged = true;

        if (normalSpawnCountRef.current >= NORMALS_BEFORE_BOSS) {
          normalSpawnCountRef.current = 0;
          jokersRef.current = [...jokersRef.current, spawnJoker(nextIdRef.current++, "boss")];
        } else {
          normalSpawnCountRef.current += 1;
          jokersRef.current = [...jokersRef.current, spawnJoker(nextIdRef.current++, "normal")];
        }
      }

      const extreme = gestureRef.current === "punch";
      let scored = false;
      let bossSlashed = false;
      const beforeCount = jokersRef.current.length;

      jokersRef.current = jokersRef.current
        .map((joker) => {
          if (joker.slashed) return joker;

          const updated = {
            ...joker,
            y: joker.y + joker.speed,
            spin: joker.spin + joker.speed * 0.8,
          };

          if (!canSlash(updated, extreme)) return updated;

          const hit =
            Math.hypot(batmanPos.x - updated.x, batmanPos.y - updated.y) <
            hitRadius(updated, extreme);

          if (hit) {
            scored = true;
            structureChanged = true;
            if (updated.type === "boss") bossSlashed = true;
            return { ...updated, slashed: true, slashTime: time };
          }

          return updated;
        })
        .filter((joker) => {
          if (joker.slashed) return time - joker.slashTime < 700;
          return joker.y < window.innerHeight + 120;
        });

      if (jokersRef.current.length !== beforeCount) {
        structureChanged = true;
      }

      const hasBoss = jokersRef.current.some((j) => j.type === "boss" && !j.slashed);
      if (hasBoss !== bossActiveRef.current) {
        bossActiveRef.current = hasBoss;
        setBossActive(hasBoss);
      }

      if (scored) {
        if (bossSlashed) {
          bossScoreRef.current += 1;
          setBossScore(bossScoreRef.current);
        } else {
          normalScoreRef.current += 1;
          setNormalScore(normalScoreRef.current);
        }
      }

      if (structureChanged) {
        syncJokersToReact();
      }
    },
    [active, batmanPosRef, syncJokersToReact],
  );

  return { jokers, jokersRef, normalScore, bossScore, bossActive, tick };
}
