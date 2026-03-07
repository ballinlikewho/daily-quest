const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

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

function getDailySeed(date) {
  return date; // e.g. "2025-3-6"
}

function getDayNumber(date) {
  const start = new Date("2025-01-01");
  return Math.floor((new Date(date) - start) / (1000 * 60 * 60 * 24)) + 1;
}

function getTodayDate() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function seededPick(arr, seed, offset = 0) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return arr[Math.abs(hash + offset) % arr.length];
}

function getDailySetup(date) {
  const seed = getDailySeed(date);
  return { questType: seededPick(QUEST_TYPES, seed, 0), tone: seededPick(TONES, seed, 7) };
}

const TREE_PROMPT = (seed, questType, tone, dayNumber) => `You are generating content for DAILY QUEST #${dayNumber}, a daily D20 adventure game. Seed: ${seed}.

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

async function generateTree(apiKey, date) {
  const { questType, tone } = getDailySetup(date);
  const seed = getDailySeed(date);
  const dayNumber = getDayNumber(date);

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 12000,
      messages: [{ role: "user", content: TREE_PROMPT(seed, questType, tone, dayNumber) }],
    }),
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Anthropic API error ${res.status}`);
  }

  const data = await res.json();
  const text = data.content.map(b => b.text || "").join("").trim();
  const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(clean);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  // Cron: runs at 11:50 PM EST (04:50 UTC)
  async scheduled(event, env, ctx) {
    const date = getTodayDate();
    console.log(`[cron] Generating tree for ${date}`);
    const tree = await generateTree(env.ANTHROPIC_API_KEY, date);
    await env.QUEST_KV.put(`tree:${date}`, JSON.stringify(tree), {
      expirationTtl: 60 * 60 * 48, // 48 hours
    });
    console.log(`[cron] Tree stored for ${date}`);
  },

  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/tree") {
      const date = url.searchParams.get("date") || getTodayDate();
      const kvKey = `tree:${date}`;

      let treeJson = await env.QUEST_KV.get(kvKey);

      // Not cached yet — generate on demand
      if (!treeJson) {
        console.log(`[fetch] Cache miss for ${date}, generating...`);
        const tree = await generateTree(env.ANTHROPIC_API_KEY, date);
        treeJson = JSON.stringify(tree);
        await env.QUEST_KV.put(kvKey, treeJson, { expirationTtl: 60 * 60 * 48 });
      }

      return new Response(treeJson, {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
