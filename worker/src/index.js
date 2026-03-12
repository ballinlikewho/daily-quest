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
  const start = new Date("2026-03-06");
  return Math.floor((new Date(date) - start) / (1000 * 60 * 60 * 24)) + 1;
}

function getTodayDate() {
  // EST = UTC-5, fixed (no DST adjustment)
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
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

const TREE_PROMPT = (seed, questType, tone, dayNumber) => `You are writing DAILY QUEST #${dayNumber} — a D20 fantasy adventure game. Seed: ${seed}.
QUEST TYPE: ${questType.label} — ${questType.desc}
TONE: ${tone.label} — ${tone.personality}

━━━ HOW THIS GAME WORKS ━━━
The entire quest — all 5 turns — is generated in a single pass before the player makes any choices. This has one critical implication you must internalize:

CHOICES ARE APPROACHES TO A SCENE, NOT FORKS IN THE ROAD.

You commit to 5 fixed scenes (like acts in a play). Each scene has one central challenge. The player chooses HOW to engage that challenge (Easy/Normal/Risky). Their roll determines how well it goes. Then the story moves to the next scene regardless.

• SUCCESS = player arrives at the next scene with an advantage
• FAILURE = player arrives at the next scene hurt, exposed, or without resources — but they still arrive

This is the only way to write a pre-generated branching story with genuine continuity. The scene is the spine. The choices are the texture.

━━━ STEP 1: INVENT YOUR SCENARIO ━━━
Before writing anything else, invent the four core elements of this quest. Be specific and unexpected.

- setting: one specific, unexpected fantasy location. Not a tavern, dungeon, or castle. Think: a dwarven tax archive, a circus that doubles as a smuggling network, a floating menagerie, a plague doctor's apothecary, a halfling banking consortium, a wizard's patent office, a thieves' guild auction house, a royal taxidermist's workshop.
- npc: one person with a name, one vivid physical or behavioral detail, and a specific urgent need. Not a type — a person. "Maret Dunn, a fence with ink-stained fingers and a debt she can't pay" not "a mysterious merchant."
- macguffin: the specific thing — named, physical, grounded. Not "a powerful artifact." "The signed confession of Lord Aldric, sealed with black wax and hidden inside a taxidermied hawk."
- complication: one twist that makes this harder than it looks. The thing that turns a simple job into a crisis.

Fantasy world only. No modern technology or institutions. Avoid: sentient objects with internet humor, "becomes self-aware" plots, generic dragons, cheese jokes.

Commit to these four elements. Everything that follows must build from them without deviation.

━━━ STEP 2: PLAN YOUR 5-SCENE SPINE ━━━
Before writing a single choice or outcome, commit to your story arc internally:

Scene 1 — THE SETUP: Where does the player start? What is the immediate, visible problem?
Scene 2 — THE PURSUIT: The player has followed the lead. Where are they now? What new obstacle or information appears?
Scene 3 — THE COMPLICATION: The twist hits. Something unexpected changes the situation. A new threat, a betrayal, a revelation. CRITICAL: At this point the player may or may not possess the macguffin — some players arrive here having never found it. Write all three choices assuming the player does NOT yet have it. The macguffin should be something to reach for, fight over, or bargain with — never something already in hand.
Scene 4 — THE CONVERGENCE: The player is at or near the final location. The endgame is visible. Stakes are at their highest.
Scene 5 — THE CLIMAX: The final confrontation. The moment of resolution.

Each scene must flow naturally from the last. A player who failed every prior turn is still at this scene — beaten up, without resources, but present. A player who succeeded every turn is here too — with advantages, but facing the same final challenge.

━━━ STEP 3: WRITE THE QUEST ━━━

OPENING (3-4 sentences):
Drop the player into the middle of the scene — in medias res. Name the NPC immediately with their vivid detail. Name the macguffin specifically. Establish the stakes and the deadline in plain terms. Plant 2-3 specific sensory or physical details (a smell, an object, a sound) that can echo through later turns. End on urgency — what must happen, and why now.

CHOICES — THE MOST IMPORTANT RULE:
Every choice must name a specific action in a specific place with a specific target. No hedging. No "whether X or Y or Z."

BAD: "Push forward on your current path, whether through the cistern or interrogating staff or pursuing by boat"
GOOD: "Slip into the drainage cistern beneath the counting house and follow the sound of running water"

BAD: "Confront whoever holds the macguffin" (vague, assumes unknown location)
GOOD: "Step into the lamplight and call Varen's name — let him come to you" (specific person, specific action)

EASY choices: cautious, indirect, low-risk. Observe, delay, deflect, hide, wait. Safe but costs time or information.
NORMAL choices: direct and competent. Fight, negotiate, use the obvious tool for the obvious job.
RISKY choices: a bold gamble with real stakes. High reward if it works. Genuinely ugly if it doesn't.

All 3 choices for a given turn must engage THE SAME SCENE AND THE SAME CHALLENGE — just differently. They are not three different stories. They are three ways to try the same thing.

OUTCOMES — THE CONTINUITY RULE:
Every outcome (success AND failure) must leave the player positioned for the next scene.

Success outcomes: the action worked. Name what was gained. The player moves forward with a specific advantage.
Failure outcomes: the action failed. Name what was lost. The player moves forward anyway — worse off, but moving. Failure is not a dead end. It is arriving at the next scene hurt.
Crit success (nat 20): something epically lucky happens ON TOP of the success. Fate intervenes. Reference the specific action.
Crit failure (nat 1): spectacular, humiliating failure. The player survives but in the worst possible position. Make it specific to the action, not generic.

4-5 sentences per outcome. Reference the scene. Reference what the player tried. Show consequence. No vague gestures toward "the situation worsens."

TURN 5 — SPECIAL RULES:
Turn 5 choices are FINAL GAMBITS — not Easy/Normal/Risky. The player rolls against the dynamic Final DC regardless of which they pick, so difficulty labels are meaningless here. Write 3 equally-weighted, dramatically distinct ways to face the final moment. Each should feel like a real choice between different kinds of heroism or desperation — not a tiered risk ladder.

Still include a difficulty field in the JSON (use EASY/NORMAL/RISKY as placeholders), but write the choices as if difficulty doesn't exist.

Choices must work for a player who dominated every prior turn AND a player who failed every prior turn.
Frame choices around the final situation — the antagonist, the object, the location — not assumed possession.

BAD: "Surrender the confession to buy your freedom" (assumes you have it)
GOOD: "Lunge for the confession as Aldric's hand closes around it — one chance, now or never" (works either way)

ENDINGS (turn 5 only):
Written as the closing beat of THIS specific quest. Reference the NPC, the macguffin, the setting. Not generic.
• nat20: legendary, fate-touched victory. Something impossible happened. VICTORY.
• nat1: catastrophic defeat. The universe said no at the worst moment. DEFEAT.
• dominated_victory: effortless. They made it look easy. VICTORY.
• solid_victory / solid_defeat: hard-fought. Could have gone either way. VICTORY or DEFEAT.
• mixed_victory / mixed_defeat: wire-to-wire. Came down to the last roll. VICTORY or DEFEAT.
• struggled_victory / struggled_defeat: rough run. Against the odds. VICTORY or DEFEAT.
• disaster_victory / disaster_defeat: miracle or inevitable end. VICTORY or DEFEAT.

━━━ OUTPUT ━━━
Raw JSON only. First character must be {. No preamble, no markdown, no commentary.

{
  "scenario": { "setting": "...", "npc": "...", "macguffin": "...", "complication": "..." },
  "title": "Quest Title",
  "opening": "3-4 sentences. In medias res. NPC named with detail. Macguffin named. Stakes and deadline explicit.",
  "turns": [
    {
      "turn": 1,
      "scene": "One sentence: where is the player, what is the immediate challenge.",
      "choices": [
        { "label": "A", "difficulty": "EASY",   "text": "specific action verb + specific target", "outcomes": { "success": "4-5 sentences", "failure": "4-5 sentences", "crit_success": "4-5 sentences", "crit_failure": "4-5 sentences" } },
        { "label": "B", "difficulty": "NORMAL", "text": "specific action", "outcomes": { "success": "...", "failure": "...", "crit_success": "...", "crit_failure": "..." } },
        { "label": "C", "difficulty": "RISKY",  "text": "specific action", "outcomes": { "success": "...", "failure": "...", "crit_success": "...", "crit_failure": "..." } }
      ]
    },
    { "turn": 2, "scene": "...", "choices": [...] },
    { "turn": 3, "scene": "...", "choices": [...] },
    { "turn": 4, "scene": "...", "choices": [...] },
    {
      "turn": 5,
      "scene": "...",
      "choices": [
        { "label": "A", "difficulty": "EASY",   "text": "...", "outcomes": { "success": "...", "failure": "...", "crit_success": "...", "crit_failure": "..." } },
        { "label": "B", "difficulty": "NORMAL", "text": "...", "outcomes": { "success": "...", "failure": "...", "crit_success": "...", "crit_failure": "..." } },
        { "label": "C", "difficulty": "RISKY",  "text": "...", "outcomes": { "success": "...", "failure": "...", "crit_success": "...", "crit_failure": "..." } }
      ],
      "endings": {
        "nat20": "...", "nat1": "...",
        "dominated_victory": "...",
        "solid_victory": "...", "solid_defeat": "...",
        "mixed_victory": "...", "mixed_defeat": "...",
        "struggled_victory": "...", "struggled_defeat": "...",
        "disaster_victory": "...", "disaster_defeat": "..."
      }
    }
  ]
}`;

async function callAnthropic(apiKey, prompt, maxTokens) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
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

async function generateTree(apiKey, date) {
  const { questType, tone } = getDailySetup(date);
  const seed = getDailySeed(date);
  const dayNumber = getDayNumber(date);
  console.log(`[generate] Generating tree for ${date}`);
  return callAnthropic(apiKey, TREE_PROMPT(seed, questType, tone, dayNumber), 16000);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  // Cron: runs at 11:50 PM EST (04:50 UTC) — pre-generates tomorrow's quest
  async scheduled(event, env, ctx) {
    const d = new Date(Date.now() - 5 * 60 * 60 * 1000); // current EST time
    d.setUTCDate(d.getUTCDate() + 1);                     // advance to tomorrow EST
    const date = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    console.log(`[cron] Generating tree for ${date}`);
    const tree = await generateTree(env.ANTHROPIC_API_KEY, date);
    await env.QUEST_KV.put(`tree:${date}`, JSON.stringify(tree), {
      expirationTtl: 60 * 60 * 48,
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
      try {
        const today = getTodayDate();
        const date = url.searchParams.get("date") || today;

        if (date !== today) {
          return new Response(JSON.stringify({ error: "Invalid date" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

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
      } catch (err) {
        console.error("[fetch] Error:", err.message);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
