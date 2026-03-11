import { useState, useEffect, useRef } from "react";

const MAX_TURNS = 5;
const WORKER_URL = import.meta.env.VITE_WORKER_URL;

const DIFFICULTY = {
  EASY:   { label: "Easy",   dc: 5,  color: "#6aaa60" },
  NORMAL: { label: "Normal", dc: 11, color: "#c8a86b" },
  RISKY:  { label: "Risky",  dc: 16, color: "#c84040" },
};

function getESTDate() {
  // EST = UTC-5, fixed (no DST adjustment)
  return new Date(Date.now() - 5 * 60 * 60 * 1000);
}
function getDailySeed() {
  const d = getESTDate();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
function getDayNumber() {
  const d = getESTDate();
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const start = Date.UTC(2026, 2, 6); // March 6, 2026
  return Math.floor((today - start) / (1000*60*60*24)) + 1;
}

const QUEST_TYPES = [
  { id:"heist",   label:"Heist",          icon:"🗝", desc:"Steal something that isn't yours" },
  { id:"mystery", label:"Mystery",        icon:"🔍", desc:"Uncover what's hidden in the dark" },
  { id:"rescue",  label:"Rescue Mission", icon:"🛡", desc:"Someone needs saving. Probably." },
  { id:"monster", label:"Monster Hunt",   icon:"🐉", desc:"Track it. Kill it. Don't die." },
  { id:"dungeon", label:"Dungeon Crawl",  icon:"🔥", desc:"Get out alive. At any cost." },
];

const TONES = [
  {
    id: "dcc", label: "Chaotic Absurdist", desc: "Manic, fourth-wall-aware, very online",
    personality: `Chaotic absurdist tone: manic energy, fourth-wall nudges, very online humor. Narrator knows this is a game. Situations escalate into beautiful nonsense. NPCs are unhinged. Stakes are ridiculous but somehow real. Death threats casual. No exclamation marks on failure.`,
  },
  {
    id: "firstlaw", label: "Grim Dark", desc: "Brutal, morally grey, every victory costs",
    personality: `Grim dark tone inspired by Joe Abercrombie: short brutal sentences, dry cynical wit, morally grey. Nobody purely heroic. Victories feel hollow. Clinical about violence. The internal voice is tired and knowing. No exclamation marks ever.`,
  },
  {
    id: "got", label: "High Drama", desc: "Rich detail, looming dread, nobody is safe",
    personality: `High drama tone inspired by GRRM: rich sensory detail, looming dread, power dynamics in every moment. Trust fragile. Consequences feel permanent. Serious, epic, dangerous. No exclamation marks.`,
  },
];

function seededPick(arr, seed, offset = 0) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return arr[Math.abs(hash + offset) % arr.length];
}

function getDailySetup() {
  const seed = getDailySeed();
  return { questType: seededPick(QUEST_TYPES, seed, 0), tone: seededPick(TONES, seed, 7) };
}

// ── Scoring ────────────────────────────────────────────────────
function calcScore(turnHistory, outcome) {
  let pts = 0;
  for (const t of turnHistory) {
    const isSuccess = t.result.label === "SUCCESS" || t.result.label === "CRITICAL SUCCESS";
    if (!isSuccess) continue;
    const base = t.difficulty === "RISKY" ? 3 : t.difficulty === "NORMAL" ? 2 : 1;
    pts += t.result.label === "CRITICAL SUCCESS" ? Math.floor(base * 1.5) : base;
  }
  if (outcome === "victory") pts += 3;
  return pts;
}

function getTier(score, maxPossible) {
  const pct = score / maxPossible;
  if (pct >= 0.85) return { tier:"S", color:"#d4af37", title:"Legendary Hero",      desc:"The bards will sing of this." };
  if (pct >= 0.65) return { tier:"A", color:"#6aaa60", title:"Seasoned Adventurer", desc:"Not bad. Not bad at all." };
  if (pct >= 0.45) return { tier:"B", color:"#c8a86b", title:"Competent Survivor",  desc:"You lived. That counts." };
  if (pct >= 0.25) return { tier:"C", color:"#c87040", title:"Lucky Fool",          desc:"Fortune favors the incompetent." };
  return               { tier:"F", color:"#c84040", title:"Absolute Disaster",     desc:"A cautionary tale for the ages." };
}

const MAX_POSSIBLE_SCORE = MAX_TURNS * 4 + 3;

// ── Dynamic Final DC ───────────────────────────────────────────
const DC_DELTA = {
  EASY:   { success: +1, failure: +3 },
  NORMAL: { success: -2, failure: +2 },
  RISKY:  { success: -3, failure: +3 },
};

function calcFinalDC(turnHistory) {
  let dc = 10;
  for (const t of turnHistory) {
    const isSuccess = t.result.label === "SUCCESS" || t.result.label === "CRITICAL SUCCESS";
    const delta = DC_DELTA[t.difficulty];
    if (delta) dc += isSuccess ? delta.success : delta.failure;
  }
  return Math.min(20, Math.max(4, dc));
}

function getFinalBucket(dc) {
  if (dc <= 6)  return "dominated";
  if (dc <= 10) return "solid";
  if (dc <= 14) return "mixed";
  if (dc <= 18) return "struggled";
  return "disaster";
}

// ── Dice ───────────────────────────────────────────────────────
function rollD20() { return Math.floor(Math.random() * 20) + 1; }

function getRollResult(roll, dc) {
  if (roll >= dc) return { label:"SUCCESS",  color:"#6aaa60", emoji:"✓" };
  return               { label:"FAILURE",  color:"#c87040", emoji:"✗" };
}

function applyMomentum(rawRoll, flatBonus, hasDisadvantage, hasAdvantage) {
  let roll2 = null, base = rawRoll;
  if (hasDisadvantage)      { roll2 = rollD20(); base = Math.min(rawRoll, roll2); }
  else if (hasAdvantage)    { roll2 = rollD20(); base = Math.max(rawRoll, roll2); }
  return { finalRoll: Math.min(20, Math.max(1, base + flatBonus)), roll2, baseRoll: base };
}

function calcNextMomentum(difficulty, isSuccess, isCritSuccess, rawRoll, flatBonus, hasDisadvantage) {
  let nb = flatBonus;
  if (isCritSuccess) return { flatBonus:nb, hasDisadvantage:false, hasAdvantage:true,  label:"⭐ Nat 20 — Advantage!", color:"#d4af37" };
  if (rawRoll === 1 && !(difficulty === "EASY" && !isSuccess)) return { flatBonus:0, hasDisadvantage:true, hasAdvantage:false, label:"💀 Nat 1 — Disadvantage!", color:"#c84040" };
  if (difficulty === "EASY"   && !isSuccess) return { flatBonus:0,                        hasDisadvantage:true,  hasAdvantage:false, label:"⬇ Disadvantage (bonus wiped)", color:"#c84040" };
  if (difficulty === "RISKY"  &&  isSuccess) return { flatBonus:nb,                       hasDisadvantage:false, hasAdvantage:true,  label:"⬆ Advantage", color:"#d4af37" };
  if (difficulty === "RISKY"  && !isSuccess) return { flatBonus:0,                        hasDisadvantage:false, hasAdvantage:false, label:"Bonus wiped", color:"#c87040" };
  if (difficulty === "NORMAL") {
    if (isSuccess) { nb = Math.min(5, nb+1); return { flatBonus:nb, hasDisadvantage:false, hasAdvantage:false, label:`+${nb} Momentum`, color:"#6aaa60" }; }
    else           { nb = Math.max(-3, nb-1); return { flatBonus:nb, hasDisadvantage:false, hasAdvantage:false, label:nb<0?`${nb} Momentum`:nb>0?`+${nb} Momentum`:"Neutral", color:"#c87040" }; }
  }
  return { flatBonus:nb, hasDisadvantage:false, hasAdvantage:false, label:nb>0?`+${nb} Momentum`:"Neutral", color:"#c8a86b" };
}

// ── Tree generation ────────────────────────────────────────────
const TREE_PROMPT = (seed, questType, tone) => `You are generating content for DAILY QUEST #${getDayNumber()}, a daily D20 adventure game. Seed: ${seed}.

QUEST TYPE: ${questType.label} — ${questType.desc}
TONE: ${tone.label} — ${tone.personality}

STEP 1 — Internally decide a unique scenario (do not output this as text, only include it in the JSON scenario field):
- setting: a specific unexpected location in a fantasy world — not a generic dungeon or tavern. Think: a floating merchant barge, a royal taxidermist's workshop, a plague doctor's apothecary, a gladiatorial betting hall, a wizard's patent office, a thieves' guild auction house, a dwarven sewage aqueduct, a monastery that brews illegal ale, a halfling banking consortium, a circus that doubles as a spy network.
- npc: quest-giver with a name, one defining trait, and a clear reason they need you. A real specific person — a disgraced herbalist, a one-armed cartographer, a corrupt toll collector who switched sides, a grieving blacksmith's widow.
- macguffin: the thing being stolen/found/killed/rescued — specific and grounded in the fantasy world
- complication: one unexpected twist that makes this harder than it looks

This is a fantasy D&D one-shot. Everything must feel like it belongs in a fantasy world — characters, locations, problems, solutions. No modern technology, no real-world institutions. Avoid: sentient objects with internet humor, cheese, midnight deadlines, "becomes self-aware" plots, generic castles, standard dragons.

STEP 2 — Build the entire quest around those decisions. Respond with ONLY raw JSON — the very first character must be {

Generate a complete quest as a single JSON object. The very first character must be {. No preamble, no markdown, no explanation — raw JSON only.

CONTINUITY IS THE MOST IMPORTANT THING. Before writing any narratives, plan the full story arc:
- What is the location and situation at each turn?
- What changes between turns — does the player move somewhere new, does the threat escalate, does a new character appear?
- Each turn's outcomes must reference the CURRENT situation, not a generic adventure
- Turn 3 outcomes should feel like they follow from turn 2's situation
- The story should build toward a climax at turn 5

Each turn has a "scene" — a brief internal note (not shown to player) describing where the player is and what's happening. Write all outcomes for that turn relative to that scene.

STRUCTURE: 5 turns. Each turn has 3 choices (A=EASY, B=NORMAL, C=RISKY). Each choice has 4 outcome narratives.
Turns 1-4 also include next_choices (the 3 choices that will appear on the NEXT turn).
Turn 5 has no next_choices — only endings.

NARRATIVE RULES:
- Opening: 3-4 sentences. Establish the NPC, the situation, and — in the final sentence — make the goal explicit and urgent. What must the player do, and why does it matter right now. Write it like a DM dropping you into a scene, not a mission briefing.
- Every outcome snippet: 4-5 sentences. Specific to the current scene. Reference what the player just tried. Show consequence.
- EASY: safest/most cowardly option. Hide, retreat, wait, stall.
- NORMAL: direct competent approach. Fight, negotiate, use the obvious tool.
- RISKY: bold dangerous gamble. Big payoff if it works, ugly if it doesn't.
- success: action worked, situation advances
- failure: action failed or backfired, situation gets harder
- crit_success: nat 20 — something epically lucky happens ON TOP of success, reference the specific action
- crit_failure: nat 1 — spectacular humiliating failure specific to this action, they survive but worse off
- Outcomes for the same choice should feel like branching versions of the same moment, not different stories

TURN 5 CHOICES — CRITICAL RULE: Turn 5 choices must work regardless of whether the player succeeded or failed earlier turns. Never assume the player holds the MacGuffin or has completed any objective. Frame choices around the final confrontation itself — the obstacle, the antagonist, the location — not assumed possession. BAD: "Surrender the shard" (assumes you have it). GOOD: "Make one last desperate grab for the shard before the guards close in" (works whether you have it or not). Every turn 5 choice must make sense for both a player who dominated AND a player who failed every prior turn.

ENDINGS (turn 5 only) — written to feel like the closing beat of THIS specific quest, not generic:
- nat20: legendary victory, fate intervened at the last second. Must contain VICTORY.
- nat1: catastrophic defeat, the universe said no at the worst moment. Must contain DEFEAT.
- dominated_victory: player dominated, they made it look easy. Must contain VICTORY.
- solid_victory / solid_defeat: hard fought, could have gone either way. Include VICTORY or DEFEAT.
- mixed_victory / mixed_defeat: coin flip, came down to the wire. Include VICTORY or DEFEAT.
- struggled_victory / struggled_defeat: rough run, against the odds. Include VICTORY or DEFEAT.
- disaster_victory / disaster_defeat: terrible run, miracle or inevitable end. Include VICTORY or DEFEAT.

JSON:
{
  "scenario": { "setting": "...", "npc": "...", "macguffin": "...", "complication": "..." },
  "title": "Quest Title",
  "opening": "2-3 sentences. Scene-setting that naturally makes the objective clear.",
  "turns": [
    {
      "turn": 1,
      "scene": "internal note: where is the player, what is the immediate situation",
      "choices": [
        { "label": "A", "difficulty": "EASY",   "text": "choice text", "outcomes": { "success": "4-5 sentence narrative", "failure": "4-5 sentence narrative", "crit_success": "4-5 sentence narrative", "crit_failure": "4-5 sentence narrative" } },
        { "label": "B", "difficulty": "NORMAL", "text": "choice text", "outcomes": { "success": "...", "failure": "...", "crit_success": "...", "crit_failure": "..." } },
        { "label": "C", "difficulty": "RISKY",  "text": "choice text", "outcomes": { "success": "...", "failure": "...", "crit_success": "...", "crit_failure": "..." } }
      ],
      "next_choices": [
        { "label": "A", "difficulty": "EASY",   "text": "choice for turn 2" },
        { "label": "B", "difficulty": "NORMAL", "text": "choice for turn 2" },
        { "label": "C", "difficulty": "RISKY",  "text": "choice for turn 2" }
      ]
    },
    { "turn": 2, "scene": "...", "choices": [...], "next_choices": [...] },
    { "turn": 3, "scene": "...", "choices": [...], "next_choices": [...] },
    { "turn": 4, "scene": "...", "choices": [...], "next_choices": [] },
    {
      "turn": 5,
      "scene": "...",
      "choices": [
        { "label": "A", "difficulty": "EASY",   "text": "choice text", "outcomes": { "success": "...", "failure": "...", "crit_success": "...", "crit_failure": "..." } },
        { "label": "B", "difficulty": "NORMAL", "text": "choice text", "outcomes": { ... } },
        { "label": "C", "difficulty": "RISKY",  "text": "choice text", "outcomes": { ... } }
      ],
      "endings": {
        "nat20": "...",
        "nat1": "...",
        "dominated_victory": "...",
        "solid_victory": "...", "solid_defeat": "...",
        "mixed_victory": "...", "mixed_defeat": "...",
        "struggled_victory": "...", "struggled_defeat": "...",
        "disaster_victory": "...", "disaster_defeat": "..."
      }
    }
  ]
}`;

async function generateTree() {
  const seed = getDailySeed();
  const res = await fetch(`${WORKER_URL}/tree?date=${seed}`);
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.error || `Worker error ${res.status}`); }
  return res.json();
}

// ── UI Components ──────────────────────────────────────────────
function OutcomeBadge({ text }) {
  const u = (text||"").toUpperCase();
  if (u.includes("VICTORY")) return <div style={bs("#d4af37","rgba(212,175,55,0.12)")}>⚔ VICTORY</div>;
  if (u.includes("DEFEAT"))  return <div style={bs("#c83c3c","rgba(200,60,60,0.12)")}>💀 DEFEAT</div>;
  return null;
}
function bs(color, bg) {
  return { display:"inline-flex", alignItems:"center", gap:"0.5rem", background:bg, border:`1px solid ${color}44`, borderRadius:3, padding:"0.4rem 0.9rem", color, fontFamily:"'Cinzel',serif", fontSize:"0.85rem", letterSpacing:"0.15em" };
}

function D20Display({ rolling, result, roll, rawRoll, flatBonus, hasAdvantage, hasDisadvantage, roll2, dc }) {
  const [d1, setD1] = useState("?");
  const [d2, setD2] = useState("?");
  const ref = useRef(null);
  const twoD = hasAdvantage || hasDisadvantage;

  useEffect(() => {
    if (rolling) {
      let i = 0;
      ref.current = setInterval(() => {
        setD1(Math.floor(Math.random()*20)+1);
        if (twoD) setD2(Math.floor(Math.random()*20)+1);
        if (++i > 14) { clearInterval(ref.current); setD1(rawRoll??roll); if (twoD&&roll2!==null) setD2(roll2); }
      }, 60);
    }
    return () => clearInterval(ref.current);
  }, [rolling, roll, rawRoll, roll2]);

  const color = result ? result.color : "#c8a86b";
  const isCrit = result && (result.label==="CRITICAL SUCCESS"||result.label==="CRITICAL FAILURE");
  const d1Wins = twoD && (hasAdvantage ? rawRoll>=(roll2??0) : rawRoll<=(roll2??99));
  const showBreakdown = flatBonus!==0 && rawRoll!==null && rawRoll!==roll;

  const ds = (winner, dimmed) => ({
    width:56, height:56, background: dimmed?"rgba(20,14,4,0.8)":`linear-gradient(135deg,${color}22,${color}11)`,
    border:`2px solid ${dimmed?"#2a1e08":color}`, borderRadius:6,
    display:"flex", alignItems:"center", justifyContent:"center",
    fontSize:"1.6rem", fontWeight:700, fontFamily:"'Cinzel',serif",
    color: dimmed?"#3a2810":color,
    boxShadow: isCrit&&!dimmed?`0 0 20px ${color}88`:`0 0 6px ${dimmed?"transparent":color+"44"}`,
    transition:"all 0.3s", animation: isCrit&&!dimmed?"glow 0.8s ease-in-out infinite alternate":"none",
    clipPath:"polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)", opacity: dimmed?0.4:1,
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5rem" }}>
      <div style={{ display:"flex", gap:"0.75rem", alignItems:"center" }}>
        <div style={ds(!twoD||d1Wins, twoD&&!d1Wins)}>{rolling?d1:(rawRoll??roll)}</div>
        {twoD && (<><span style={{ color:"#5a4020", fontSize:"0.7rem", fontFamily:"'Cinzel',serif" }}>{hasAdvantage?"↑":"↓"}</span><div style={ds(!d1Wins,d1Wins)}>{rolling?d2:(roll2??"?")}</div></>)}
      </div>
      {result && !rolling && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.2rem" }}>
          {twoD && <div style={{ fontSize:"0.82rem", color:"#5a4020", fontFamily:"'Cinzel',serif" }}>{hasAdvantage?"Advantage":"Disadvantage"} · took {rawRoll} of [{rawRoll}, {roll2}]</div>}
          {showBreakdown && <div style={{ fontSize:"0.88rem", fontFamily:"'Cinzel',serif", color:flatBonus>0?"#6aaa60":"#c87040" }}>{rawRoll} {flatBonus>0?`+ ${flatBonus}`:`− ${Math.abs(flatBonus)}`} = <span style={{ color, fontWeight:700 }}>{Math.min(20,roll)}</span></div>}
          <div style={{ fontSize:"0.85rem", color, fontFamily:"'Cinzel',serif", letterSpacing:"0.1em" }}>{result.emoji} {result.label} {dc&&<span style={{ color:"#5a4020" }}>vs DC {dc}</span>}</div>
        </div>
      )}
    </div>
  );
}

const parchmentNoise = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`;

// ── Main Component ─────────────────────────────────────────────
export default function DailyQuest() {
  const [phase, setPhase] = useState("intro");
  const [tree, setTree] = useState(null);
  const [turn, setTurn] = useState(0);
  const [currentChoices, setCurrentChoices] = useState([]);
  const [narrative, setNarrative] = useState([]);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState(null);
  const [copied, setCopied] = useState(false);

  const [pendingAction, setPendingAction] = useState(null);
  const [currentRoll, setCurrentRoll] = useState(null);
  const [rawRoll, setRawRoll] = useState(null);
  const [roll2, setRoll2] = useState(null);
  const [rollResult, setRollResult] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [nextMomentum, setNextMomentum] = useState(null);

  const [flatBonus, setFlatBonus] = useState(0);
  const [hasDisadvantage, setHasDisadvantage] = useState(false);
  const [hasAdvantage, setHasAdvantage] = useState(false);
  const [easyFailures, setEasyFailures] = useState(0);
  const [turnHistory, setTurnHistory] = useState([]);
  const [showHelp, setShowHelp] = useState(false);

  const { questType, tone } = getDailySetup();
  const bottomRef = useRef(null);
  const seed = getDailySeed();
  const dayNum = getDayNumber();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [narrative, phase, rolling]);

  async function beginQuest() {
    setPhase("generating");
    setError("");
    try {
      const t = await generateTree();
      setTree(t);
      setNarrative([{ text:t.opening }]);
      setCurrentChoices(t.turns[0].choices);
      setPhase("choosing");
    } catch(e) {
      setError(e.message);
      setPhase("intro");
    }
  }

  function selectAction(choice) {
    setPendingAction(choice);
    setPhase("rolling");
    setCurrentRoll(null); setRawRoll(null); setRoll2(null); setRollResult(null);
  }

  function executeRoll() {
    const raw = rollD20();
    const { finalRoll, roll2:r2, baseRoll } = applyMomentum(raw, flatBonus, hasDisadvantage, hasAdvantage);
    setRawRoll(baseRoll); setCurrentRoll(finalRoll); setRoll2(r2); setRolling(true);
    const isNat20 = baseRoll === 20, isNat1 = baseRoll === 1;
    const isFinalTurn = turn === MAX_TURNS - 1;
    const effectiveDC = isFinalTurn ? calcFinalDC(turnHistory) : DIFFICULTY[pendingAction.difficulty].dc;
    const base = getRollResult(finalRoll, effectiveDC);
    const trueResult = isNat20 ? { label:"CRITICAL SUCCESS", color:"#d4af37", emoji:"⭐" }
      : isNat1 ? { label:"CRITICAL FAILURE", color:"#c84040", emoji:"💀" } : base;
    setTimeout(() => {
      setRolling(false); setRollResult(trueResult);
      const isSuccess = trueResult.label==="SUCCESS"||trueResult.label==="CRITICAL SUCCESS";
      if (!isFinalTurn) setNextMomentum(calcNextMomentum(pendingAction.difficulty, isSuccess, isNat20, baseRoll, flatBonus, hasDisadvantage));
    }, 900);
  }

  function confirmRoll() {
    if (!rollResult || !pendingAction) return;
    const isSuccess = rollResult.label==="SUCCESS"||rollResult.label==="CRITICAL SUCCESS";
    const isNat20 = rawRoll===20, isNat1 = rawRoll===1;
    const isFinal = turn === MAX_TURNS-1;
    const turnData = tree.turns[turn];

    // Track easy failures
    let newEasyFails = easyFailures;
    if (pendingAction.difficulty==="EASY" && !isSuccess) {
      newEasyFails = easyFailures+1;
      setEasyFailures(newEasyFails);
      if (newEasyFails >= 3) {
        const defeatText = tree.turns[MAX_TURNS-1]?.endings?.disaster_defeat || "Three simple tasks failed. The world noticed. DEFEAT.";
        setNarrative(n => [...n,
          { isAction:true, text:pendingAction.text, result:rollResult, roll:currentRoll, rawRoll, difficulty:pendingAction.difficulty, dc:DIFFICULTY[pendingAction.difficulty].dc },
          { text:defeatText, isOutcome:true }
        ]);
        setTurnHistory(h => [...h, { roll:currentRoll, rawRoll, result:rollResult, dc:DIFFICULTY[pendingAction.difficulty].dc, difficulty:pendingAction.difficulty }]);
        setOutcome("defeat"); setPhase("done");
        setPendingAction(null); setCurrentRoll(null); setRawRoll(null); setRoll2(null); setRollResult(null); setNextMomentum(null);
        return;
      }
    }

    // Get narrative text
    let narrativeText = "";
    if (isFinal) {
      const dc = calcFinalDC(turnHistory);
      const bucket = getFinalBucket(dc);
      if (isNat20) { narrativeText = turnData.endings.nat20; setOutcome("victory"); }
      else if (isNat1) { narrativeText = turnData.endings.nat1; setOutcome("defeat"); }
      else {
        const won = getRollResult(currentRoll, dc).label === "SUCCESS";
        const key = bucket==="dominated" ? "dominated_victory" : `${bucket}_${won?"victory":"defeat"}`;
        narrativeText = turnData.endings[key] || (won ? turnData.endings.solid_victory : turnData.endings.solid_defeat);
        setOutcome(won ? "victory" : "defeat");
      }
    } else {
      const choiceData = turnData.choices.find(c => c.label===pendingAction.label);
      narrativeText = isNat20 ? choiceData.outcomes.crit_success
        : isNat1 ? choiceData.outcomes.crit_failure
        : isSuccess ? choiceData.outcomes.success
        : choiceData.outcomes.failure;
    }

    // Apply momentum
    const next = calcNextMomentum(pendingAction.difficulty, isSuccess, isNat20, rawRoll, flatBonus, hasDisadvantage);
    setFlatBonus(next.flatBonus); setHasDisadvantage(next.hasDisadvantage); setHasAdvantage(next.hasAdvantage||false);

    const actionDC = isFinal ? calcFinalDC(turnHistory) : DIFFICULTY[pendingAction.difficulty].dc;
    const newHistory = [...turnHistory, { roll:currentRoll, rawRoll, result:rollResult, dc:actionDC, difficulty:pendingAction.difficulty }];
    setTurnHistory(newHistory);
    setNarrative(n => [...n,
      { isAction:true, text:pendingAction.text, result:rollResult, roll:currentRoll, rawRoll, difficulty:isFinal ? null : pendingAction.difficulty, dc:actionDC, isFinalTurn:isFinal },
      { text:narrativeText, isOutcome:isFinal }
    ]);

    if (isFinal) {
      setPhase("done");
    } else {
      const nextTurnChoices = tree.turns[turn+1]?.choices || [];
      setCurrentChoices(nextTurnChoices);
      setTurn(t => t+1);
      setPhase("choosing");
    }
    setPendingAction(null); setCurrentRoll(null); setRawRoll(null); setRoll2(null); setRollResult(null); setNextMomentum(null);
  }

  function copyResult() {
    const score = calcScore(turnHistory, outcome);
    const { tier, title } = getTier(score, MAX_POSSIBLE_SCORE);
    const rollTrail = turnHistory.map(t => {
      if (t.rawRoll===20) return "⭐";
      if (t.result.label==="CRITICAL FAILURE") return "💀";
      if (t.result.label==="CRITICAL SUCCESS") return "⭐";
      if (t.result.label==="SUCCESS") return "🟩";
      return "🟥";
    }).join("");
    navigator.clipboard.writeText(`⚔️ Daily Quest #${dayNum}\n${tree?.title||questType.label} · ${tone.label}\n\n${rollTrail}\n\n${outcome==="victory"?"⚔️":"💀"} ${outcome?.toUpperCase()} · ${tier} — ${title}`);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  }

  const HelpModal = () => {
    const Section = ({heading, rows}) => (
      <div style={{ marginBottom:"1rem" }}>
        <div style={{ fontFamily:"'Cinzel',serif", color:"#c8a86b", fontSize:"0.85rem", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:"0.5rem", borderBottom:"1px solid #2a1e08", paddingBottom:"0.3rem" }}>{heading}</div>
        {rows.map((r,j) => (
          <div key={j} style={{ display:"flex", flexWrap:"wrap", gap:"0.15rem 0.6rem", alignItems:"baseline", padding:"0.4rem 0", borderBottom:"1px solid #1a1208" }}>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:"0.85rem", color:"#c8a86b" }}>{r[0]}</span>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:"0.85rem", color: r[3] || "#6aaa60" }}>{r[1]}</span>
            {r[2] && <span style={{ fontFamily:"'IM Fell English',serif", fontStyle:"italic", fontSize:"0.82rem", color:"#5a4020" }}>{r[2]}</span>}
          </div>
        ))}
      </div>
    );
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:"1.5rem" }} onClick={()=>setShowHelp(false)}>
        <div style={{ background:"linear-gradient(160deg,#221a0a,#1a1208)", border:"1px solid #5a3a10", borderRadius:4, padding:"1.8rem", maxWidth:420, width:"100%", maxHeight:"85vh", overflowY:"auto", boxShadow:"0 0 60px rgba(0,0,0,0.8)" }} onClick={e=>e.stopPropagation()}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.2rem" }}>
            <div style={{ fontFamily:"'Cinzel',serif", color:"#e8c87a", fontSize:"1rem", letterSpacing:"0.1em" }}>How to Play</div>
            <button onClick={()=>setShowHelp(false)} style={{ background:"none", border:"none", color:"#5a4020", cursor:"pointer", fontSize:"1.2rem" }}>✕</button>
          </div>
          <div style={{ fontFamily:"'Cinzel',serif", color:"#7a5e2e", fontSize:"0.9rem", lineHeight:1.8, marginBottom:"1.2rem", paddingBottom:"1rem", borderBottom:"1px solid #2a1e08", letterSpacing:"0.03em" }}>
            A daily 5-turn adventure. Each turn pick Easy, Normal, or Risky — then roll a d20. Your choices build momentum and shape a Dynamic DC for the final roll. Beat it to win. Come back tomorrow for a new quest.
          </div>
          <Section heading="Momentum" rows={[
            ["Nat 20","Advantage","next turn", "#d4af37"],
            ["Nat 1","Disadvantage","next turn", "#c84040"],
            ["Risky success","Advantage","next turn", "#d4af37"],
            ["Risky failure","Bonus wiped","", "#c84040"],
            ["Normal success","+1 bonus","max +5", "#6aaa60"],
            ["Normal failure","−1 bonus","min −3", "#c84040"],
            ["Easy success","No effect","cowardice noted", "#5a4020"],
            ["Easy failure","Disadvantage","+ bonus wiped", "#c84040"],
          ]} />
          <Section heading="Final DC (starts at 10)" rows={[
            ["Easy success","+1 DC","cowardice noted", "#c87040"],
            ["Easy failure","+3 DC","", "#c84040"],
            ["Normal success","−2 DC","", "#6aaa60"],
            ["Normal failure","+2 DC","", "#c84040"],
            ["Risky success","−3 DC","", "#6aaa60"],
            ["Risky failure","+3 DC","", "#c84040"],
          ]} />
          <Section heading="Final Roll" rows={[
            ["Nat 20","Auto VICTORY","fate intervenes", "#d4af37"],
            ["Nat 1","Auto DEFEAT","fate intervenes", "#c84040"],
            ["3 Easy failures","Instant DEFEAT","before turn 5", "#c84040"],
          ]} />
          <div style={{ textAlign:"center", color:"#3a2810", fontSize:"0.82rem", fontFamily:"'Cinzel',serif", marginTop:"0.5rem" }}>Click outside to close</div>
        </div>
      </div>
    );
  };
  if (phase==="intro"||phase==="generating") return (
    <div style={{ minHeight:"100vh", background:"#1a1208", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Palatino Linotype',Palatino,'Book Antiqua',serif", padding:"2rem", backgroundImage:parchmentNoise }}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet" />
      {showHelp && <HelpModal />}
      <div style={{ maxWidth:480, width:"100%", textAlign:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"1rem", marginBottom:"2rem", opacity:0.4 }}>
          <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#c8a86b)" }} />
          <span style={{ color:"#c8a86b" }}>✦</span>
          <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#c8a86b)" }} />
        </div>
        <div style={{ fontSize:"0.82rem", letterSpacing:"0.25em", color:"#8b6e3a", textTransform:"uppercase", fontFamily:"'Cinzel',serif", marginBottom:"0.6rem" }}>The Chronicles · Day {dayNum}</div>
        <h1 style={{ fontFamily:"'Cinzel',serif", fontSize:"3rem", fontWeight:700, color:"#e8c87a", margin:"0 0 0.2rem", letterSpacing:"0.08em", textShadow:"0 2px 20px rgba(200,160,80,0.3)" }}>Daily Quest</h1>
        <p style={{ fontFamily:"'IM Fell English',serif", fontStyle:"italic", color:"#9a7e4a", fontSize:"1rem", marginBottom:"2.5rem", lineHeight:1.6 }}>
          A new adventure every dawn. {MAX_TURNS} turns.<br/>Roll the d20. Pray to your gods.
        </p>
        <div style={{ background:"linear-gradient(160deg,#221a0a,#1a1208)", border:"1px solid #3a2a0e", borderRadius:2, padding:"2rem", marginBottom:"1.5rem", boxShadow:"inset 0 0 30px rgba(0,0,0,0.4)" }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:"1.5rem" }}>
            <div style={{ width:56, height:56, background:"rgba(200,168,107,0.1)", border:"2px solid #c8a86b44", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.6rem", fontFamily:"'Cinzel',serif", color:"#c8a86b44", clipPath:"polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)" }}>20</div>
          </div>
          <div style={{ display:"flex", justifyContent:"center", gap:"1.5rem", marginBottom:"1rem" }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:"1.4rem", marginBottom:"0.2rem" }}>{questType.icon}</div>
              <div style={{ color:"#c8a86b", fontFamily:"'Cinzel',serif", fontSize:"0.85rem", letterSpacing:"0.1em" }}>{questType.label}</div>
              <div style={{ color:"#5a4020", fontSize:"0.82rem" }}>{questType.desc}</div>
            </div>
            <div style={{ width:1, background:"#3a2810", alignSelf:"stretch" }} />
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:"1.4rem", marginBottom:"0.2rem" }}>🎭</div>
              <div style={{ color:"#c8a86b", fontFamily:"'Cinzel',serif", fontSize:"0.85rem", letterSpacing:"0.1em" }}>{tone.label}</div>
              <div style={{ color:"#5a4020", fontSize:"0.82rem" }}>{tone.desc}</div>
            </div>
          </div>
          <div style={{ borderTop:"1px solid #2e1e08", paddingTop:"0.75rem", marginBottom:"1.5rem", color:"#7a5e2e", fontSize:"0.82rem" }}>
            <span style={{ color:"#6aaa60" }}>Easy (DC 5)</span> · <span style={{ color:"#c8a86b" }}>Normal (DC 11)</span> · <span style={{ color:"#c84040" }}>Risky (DC 16)</span>
          </div>
          {error && <div style={{ color:"#c84040", fontSize:"0.82rem", marginBottom:"1rem" }}>⚠ {error}</div>}
          {phase==="generating" ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.75rem", padding:"0.5rem 0" }}>
              <div style={{ display:"flex", gap:"0.5rem" }}>
                {[0,1,2].map(i=><div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"#c8a86b", animation:"flicker 1.4s ease-in-out infinite", animationDelay:`${i*0.22}s`, opacity:0.4 }} />)}
              </div>
              <div style={{ color:"#5a4020", fontSize:"0.82rem", fontFamily:"'Cinzel',serif", letterSpacing:"0.1em" }}>Weaving today's quest...</div>
            </div>
          ) : (
            <>
            <button onClick={beginQuest} style={{ width:"100%", padding:"0.9rem", background:"linear-gradient(135deg,#5a3a0a,#3a2408)", border:"1px solid #8a6030", borderRadius:2, color:"#e8c87a", fontSize:"0.85rem", letterSpacing:"0.25em", textTransform:"uppercase", cursor:"pointer", fontFamily:"'Cinzel',serif", fontWeight:600 }}
              onMouseEnter={e=>e.target.style.background="linear-gradient(135deg,#7a5010,#5a3408)"}
              onMouseLeave={e=>e.target.style.background="linear-gradient(135deg,#5a3a0a,#3a2408)"}>
              Roll for Adventure
            </button>
            <button onClick={()=>setShowHelp(true)} style={{ marginTop:"0.75rem", background:"none", border:"none", color:"#5a4020", cursor:"pointer", fontSize:"0.85rem", fontFamily:"'Cinzel',serif", letterSpacing:"0.1em", textTransform:"uppercase", textDecoration:"underline", textDecorationColor:"#3a2810", minHeight:44 }}>
              How to Play
            </button>
            </>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"1rem", opacity:0.4 }}>
          <div style={{ flex:1, height:1, background:"linear-gradient(to right,transparent,#c8a86b)" }} />
          <span style={{ color:"#c8a86b" }}>✦</span>
          <div style={{ flex:1, height:1, background:"linear-gradient(to left,transparent,#c8a86b)" }} />
        </div>
      </div>
    </div>
  );

  // ── MAIN GAME ──────────────────────────────────────────────────
  const score = phase==="done" ? calcScore(turnHistory,outcome) : 0;
  const tierData = phase==="done" ? getTier(score,MAX_POSSIBLE_SCORE) : null;
  const isFinalRoll = turn===MAX_TURNS-1;
  const activeDC = phase==="rolling" ? (isFinalRoll ? calcFinalDC(turnHistory) : DIFFICULTY[pendingAction?.difficulty]?.dc) : null;
  const dcColor = activeDC >= 17 ? "#c84040" : activeDC >= 13 ? "#c87040" : activeDC >= 8 ? "#c8a86b" : "#6aaa60";
  const currentFinalDC = turnHistory.length > 0 ? calcFinalDC(turnHistory) : 10;
  const finalDCColor = currentFinalDC >= 17 ? "#c84040" : currentFinalDC >= 13 ? "#c87040" : currentFinalDC >= 8 ? "#c8a86b" : "#6aaa60";

  return (
    <div style={{ height:"100vh", background:"#1a1208", display:"flex", flexDirection:"column", fontFamily:"'Palatino Linotype',Palatino,'Book Antiqua',serif", backgroundImage:parchmentNoise, overflow:"hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet" />
      {showHelp && <HelpModal />}

      {/* Header */}
      <div style={{ padding:"0.85rem 1.5rem", borderBottom:"1px solid #2e1e08", display:"flex", alignItems:"center", justifyContent:"space-between", background:"rgba(10,8,4,0.7)" }}>
        <div>
          <div style={{ fontFamily:"'Cinzel',serif", color:"#e8c87a", fontSize:"0.9rem", letterSpacing:"0.1em" }}>{tree?.title||"Daily Quest"}</div>
          <div style={{ fontSize:"0.78rem", color:"#8a6a3a", letterSpacing:"0.2em", textTransform:"uppercase" }}>Day {dayNum} · {seed}</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"0.35rem" }}>
          {(hasDisadvantage||hasAdvantage||flatBonus!==0) && (
            <div style={{ fontSize:"0.8rem", fontFamily:"'Cinzel',serif", letterSpacing:"0.1em", color:hasDisadvantage?"#c84040":hasAdvantage?"#d4af37":flatBonus>0?"#6aaa60":"#c87040" }}>
              {hasDisadvantage?"⬇ Disadvantage":hasAdvantage?"⬆ Advantage":flatBonus>0?`+${flatBonus} Momentum`:`${flatBonus} Momentum`}
            </div>
          )}
          <div style={{ fontSize:"0.8rem", fontFamily:"'Cinzel',serif", letterSpacing:"0.1em", color:"#a07840" }}>
            Final DC <span style={{ color:finalDCColor, fontWeight:700 }}>{currentFinalDC}</span>
            <span style={{ color:"#8a6a3a", marginLeft:4 }}>({currentFinalDC>=17?"brutal":currentFinalDC>=13?"hard":currentFinalDC>=8?"fair":"easy"})</span>
          </div>
          <div style={{ display:"flex", gap:"0.5rem", alignItems:"center" }}>
            <div style={{ display:"flex", gap:"0.35rem", alignItems:"center" }}>
              {Array.from({length:MAX_TURNS}).map((_,i) => {
                const th = turnHistory[i];
                if (th?.rawRoll===20) return <span key={i} style={{ fontSize:"0.75rem",lineHeight:1 }}>⭐</span>;
                if (th?.result?.label==="CRITICAL FAILURE") return <span key={i} style={{ fontSize:"0.75rem",lineHeight:1 }}>💀</span>;
                return <div key={i} style={{ width:9,height:9,borderRadius:"50%", background:th?th.result.color:"#2a1e08", border:`1px solid ${th?th.result.color:"#3a2a0e"}`, transition:"all 0.4s", boxShadow:i===turn-1?`0 0 6px ${th?th.result.color+"88":"rgba(200,168,107,0.6)"}`:""}} />;
              })}
            </div>
            <button onClick={()=>setShowHelp(true)} style={{ background:"none", border:"1px solid #6a4a20", borderRadius:"50%", width:32, height:32, color:"#a07840", cursor:"pointer", fontSize:"0.82rem", fontFamily:"'Cinzel',serif", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>?</button>
          </div>
        </div>
      </div>

      {/* Narrative feed */}
      <div style={{ flex:1, overflowY:"auto", padding:"1.5rem", maxWidth:660, margin:"0 auto", width:"100%", boxSizing:"border-box" }}>
        {narrative.map((n,i) => {
          if (n.isAction) {
            const color = n.result.label==="CRITICAL SUCCESS"?"#d4af37":n.result.label==="CRITICAL FAILURE"?"#c84040":n.result.label==="SUCCESS"?"#6aaa60":"#c87040";
            const modNote = n.rawRoll!==null && n.rawRoll!==undefined && n.roll!==undefined && n.rawRoll!==n.roll
              ? ` (${n.rawRoll} ${n.roll>n.rawRoll?`+ ${n.roll-n.rawRoll}`:`− ${n.rawRoll-n.roll}`} = ${Math.min(20,n.roll)})` : "";
            return (
              <div key={i} style={{ textAlign:"right", marginBottom:"1.2rem", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"0.35rem" }}>
                <span style={{ display:"inline-block", background:"rgba(30,20,8,0.8)", border:"1px solid #3a2810", borderRadius:"2px 2px 0 2px", padding:"0.5rem 0.9rem", fontSize:"0.88rem", color:"#9a7840", fontFamily:"'IM Fell English',serif", fontStyle:"italic", maxWidth:"75%", textAlign:"left" }}>"{n.text}"</span>
                <div style={{ display:"inline-flex", alignItems:"center", gap:"0.5rem", background:`${color}11`, border:`1px solid ${color}44`, borderRadius:2, padding:"0.25rem 0.7rem", fontSize:"0.75rem", color, fontFamily:"'Cinzel',serif", letterSpacing:"0.1em" }}>
                  🎲 {n.roll}{modNote} · {n.isFinalTurn ? `⚔ Final Roll · DC ${n.dc}` : n.difficulty} · {n.result.label}
                </div>
              </div>
            );
          }
          return (
            <div key={i} style={{ marginBottom:"1.5rem", animation:i===narrative.length-1?"fadeIn 0.4s ease":"none" }}>
              <div style={{ background:"linear-gradient(160deg,rgba(30,20,8,0.9),rgba(20,14,4,0.95))", border:"1px solid #3a2810", borderRadius:2, padding:"1.2rem 1.4rem", fontSize:"0.96rem", lineHeight:1.85, color:"#d4b882", fontFamily:"'IM Fell English',serif", whiteSpace:"pre-wrap", boxShadow:"inset 0 0 20px rgba(0,0,0,0.3)" }}>
                {n.text}
                {n.isOutcome && <div style={{ marginTop:"1.2rem", paddingTop:"1rem", borderTop:"1px solid #2e1e08" }}><OutcomeBadge text={n.text} /></div>}
              </div>
            </div>
          );
        })}

        {/* Roll modal */}
        {phase==="rolling" && pendingAction && (
          <div style={{ background:"linear-gradient(160deg,rgba(20,14,4,0.97),rgba(10,8,4,0.99))", border:`1px solid ${rollResult?rollResult.color+"66":"#c8a86b44"}`, borderRadius:4, padding:"1.5rem", marginBottom:"1.5rem", textAlign:"center", animation:"fadeIn 0.3s ease", boxShadow:rollResult&&(rollResult.label==="CRITICAL SUCCESS"||rollResult.label==="CRITICAL FAILURE")?`0 0 30px ${rollResult.color}44`:"none" }}>
            <div style={{ fontSize:"0.82rem", color:"#5a4020", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"'Cinzel',serif", marginBottom:"0.75rem" }}>
              {isFinalRoll
                ? <><span style={{ color:"#d4af37" }}>⚔ Final Roll</span> · DC <span style={{ color:dcColor, fontWeight:700 }}>{activeDC}</span> <span style={{ color:"#5a4020", fontSize:"0.78rem" }}>({activeDC>=17?"brutal":activeDC>=13?"hard":activeDC>=8?"fair":"easy"} — earned from your run)</span></>
                : <>Rolling · <span style={{ color:DIFFICULTY[pendingAction.difficulty]?.color }}>{pendingAction.difficulty}</span> · DC {DIFFICULTY[pendingAction.difficulty]?.dc}</>
              }
              {(hasAdvantage||hasDisadvantage||flatBonus!==0) && (
                <span style={{ color:hasDisadvantage?"#c84040":"#6aaa60", marginLeft:8 }}>
                  · {hasDisadvantage?"⬇ Disadvantage":hasAdvantage?"⬆ Advantage":flatBonus>0?`+${flatBonus} Bonus`:`${flatBonus} Penalty`}
                </span>
              )}
            </div>
            <div style={{ fontFamily:"'IM Fell English',serif", fontStyle:"italic", color:"#9a7840", fontSize:"0.95rem", margin:"0 auto 1.2rem", maxWidth:300 }}>"{pendingAction.text}"</div>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:"1.2rem" }}>
              <D20Display rolling={rolling} result={rollResult} roll={currentRoll} rawRoll={rawRoll} flatBonus={flatBonus} hasAdvantage={hasAdvantage} hasDisadvantage={hasDisadvantage} roll2={roll2} dc={activeDC} />
            </div>
            {rollResult && !rolling && nextMomentum && !isFinalRoll && (
              <div style={{ fontSize:"0.85rem", color:nextMomentum.color, fontFamily:"'Cinzel',serif", letterSpacing:"0.1em", marginBottom:"1rem", opacity:0.85 }}>
                Next turn: {nextMomentum.label}
              </div>
            )}
            {!currentRoll && !rolling && (
              <button onClick={executeRoll} style={{ padding:"0.75rem 2rem", background:"linear-gradient(135deg,#5a3a0a,#3a2408)", border:"1px solid #8a6030", borderRadius:2, color:"#e8c87a", fontSize:"0.85rem", letterSpacing:"0.2em", textTransform:"uppercase", cursor:"pointer", fontFamily:"'Cinzel',serif" }}>Roll the Dice</button>
            )}
            {rollResult && !rolling && (
              <button onClick={confirmRoll} style={{ padding:"0.75rem 2rem", background:`linear-gradient(135deg,${rollResult.color}33,${rollResult.color}11)`, border:`1px solid ${rollResult.color}66`, borderRadius:2, color:rollResult.color, fontSize:"0.85rem", letterSpacing:"0.2em", textTransform:"uppercase", cursor:"pointer", fontFamily:"'Cinzel',serif" }}>Continue the Story →</button>
            )}
          </div>
        )}

        {error && <div style={{ background:"rgba(60,10,10,0.6)", border:"1px solid #5a2020", borderRadius:2, padding:"0.75rem 1rem", color:"#c84040", fontSize:"0.82rem", marginBottom:"1rem" }}>⚠ {error}</div>}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div style={{ borderTop:"1px solid #2e1e08", background:"rgba(10,8,4,0.7)", padding:"1rem 1.5rem", maxWidth:660, margin:"0 auto", width:"100%", boxSizing:"border-box" }}>
        {currentChoices.length>0 && phase==="choosing" && (
          <div style={{ display:"flex", flexDirection:"column", gap:"0.4rem" }}>
            {isFinalRoll && <div style={{ fontFamily:"'Cinzel',serif", fontSize:"0.82rem", color:"#c8a86b", letterSpacing:"0.15em", textTransform:"uppercase", textAlign:"center", marginBottom:"0.25rem", opacity:0.7 }}>⚔ Choose your final gambit</div>}
            {currentChoices.map(c => (
              <button key={c.label} onClick={()=>selectAction(c)}
                style={{ padding:"0.75rem 1rem", minHeight:52, background:"transparent", border:`1px solid ${isFinalRoll?"#6a4a20":"#3a2810"}`, borderRadius:2, color:"#9a7840", fontSize:"0.9rem", textAlign:"left", cursor:"pointer", fontFamily:"'IM Fell English',serif", display:"flex", gap:"0.75rem", alignItems:"center", transition:"all 0.15s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=isFinalRoll?"#c8a86b88":DIFFICULTY[c.difficulty].color+"88";e.currentTarget.style.background=isFinalRoll?"rgba(200,168,107,0.08)":`${DIFFICULTY[c.difficulty].color}11`;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=isFinalRoll?"#6a4a20":"#3a2810";e.currentTarget.style.background="transparent";}}>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:"0.8rem", color:"#c8a86b", border:"1px solid #5a3a10", borderRadius:2, padding:"0.15rem 0.4rem", flexShrink:0, letterSpacing:"0.1em" }}>{c.label}</span>
                <span style={{ flex:1 }}>{c.text}</span>
                {!isFinalRoll && <span style={{ fontSize:"0.82rem", color:DIFFICULTY[c.difficulty].color, fontFamily:"'Cinzel',serif", flexShrink:0, opacity:0.8 }}>{c.difficulty==="EASY"?"🟢":c.difficulty==="NORMAL"?"🟡":"🔴"} {c.difficulty} · DC {DIFFICULTY[c.difficulty].dc}</span>}
              </button>
            ))}
          </div>
        )}

        {phase==="done" && tierData && (
          <div style={{ textAlign:"center", padding:"0.75rem 0" }}>
            <div style={{ background:`linear-gradient(135deg,${tierData.color}11,${tierData.color}08)`, border:`1px solid ${tierData.color}44`, borderRadius:3, padding:"1rem 1.5rem", marginBottom:"0.75rem" }}>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:"2rem", color:tierData.color, letterSpacing:"0.1em", lineHeight:1 }}>{tierData.tier}</div>
              <div style={{ fontFamily:"'Cinzel',serif", fontSize:"0.9rem", color:tierData.color, letterSpacing:"0.12em", margin:"0.3rem 0 0.2rem" }}>{tierData.title}</div>
              <div style={{ fontFamily:"'IM Fell English',serif", fontStyle:"italic", color:"#7a5e2e", fontSize:"0.82rem", marginBottom:"0.5rem" }}>{tierData.desc}</div>
            </div>
            <div style={{ color:"#5a4020", fontSize:"0.85rem", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"'Cinzel',serif", marginBottom:"0.75rem" }}>Quest Complete · Return tomorrow</div>
            <button onClick={copyResult} style={{ padding:"0.85rem 1.8rem", minHeight:48, background:"transparent", border:"1px solid #5a3a10", borderRadius:2, color:copied?"#6aaa60":"#c8a86b", cursor:"pointer", fontSize:"0.88rem", letterSpacing:"0.15em", fontFamily:"'Cinzel',serif", textTransform:"uppercase" }}>
              {copied?"✓ Copied!":"Share Result"}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
        @keyframes flicker { 0%,100%{opacity:0.3;transform:scale(0.85)}50%{opacity:1;transform:scale(1.1)} }
        @keyframes glow { from{box-shadow:0 0 10px currentColor}to{box-shadow:0 0 25px currentColor} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0e0b04} ::-webkit-scrollbar-thumb{background:#3a2810;border-radius:2px}
        @media (max-width:520px) {
          * { -webkit-tap-highlight-color: transparent; }
        }
      `}</style>
    </div>
  );
}
