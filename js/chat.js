/* ============================================================
   Cortex AI — demo brain + markdown renderer
   No network, no backend: replies are written responses that
   stream in like the real thing.
   ============================================================ */

(() => {
  "use strict";

  const FENCE = "```";

  const THINKING = [
    "Reading the request and finding the real question…",
    "Sketching two or three ways to answer…",
    "Checking the details that usually go wrong…",
    "Picking the clearest structure…",
    "Tightening the wording before replying…",
  ];

  /* ---------- text helpers ---------- */

  const ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
  }

  function inline(value) {
    const codes = [];

    let text = value.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
    });

    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

    text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => {
      return `<code>${codes[Number(index)]}</code>`;
    });

    return text;
  }

  /**
   * Tiny markdown renderer: headings, lists, quotes, fenced code,
   * bold / italic / inline code. Everything is escaped first.
   */
  function render(markdown) {
    const source = String(markdown == null ? "" : markdown).replace(/\r\n/g, "\n");
    const lines = source.split("\n");

    let html = "";
    let list = null;
    let index = 0;

    const closeList = () => {
      if (!list) return;
      html += `</${list}>`;
      list = null;
    };

    const openList = (type) => {
      if (list === type) return;
      closeList();
      html += `<${type}>`;
      list = type;
    };

    while (index < lines.length) {
      const line = lines[index];

      // fenced code
      if (/^\s*```/.test(line)) {
        closeList();
        const lang = line.replace(/^\s*```/, "").trim();
        let code = "";
        index += 1;

        while (index < lines.length && !/^\s*```/.test(lines[index])) {
          code += lines[index] + "\n";
          index += 1;
        }

        index += 1; // consume closing fence (or run past the end while streaming)

        html +=
          `<div class="codeblock">` +
          `<div class="codeblock__bar">` +
          `<span class="codeblock__lang">${escapeHtml(lang || "code")}</span>` +
          `<button class="codeblock__copy" type="button">Copy</button>` +
          `</div>` +
          `<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>` +
          `</div>`;
        continue;
      }

      // blank line
      if (/^\s*$/.test(line)) {
        closeList();
        index += 1;
        continue;
      }

      // headings
      const heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        closeList();
        const level = heading[1].length >= 3 ? 3 : 2;
        html += `<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`;
        index += 1;
        continue;
      }

      // blockquote
      if (/^>\s?/.test(line)) {
        closeList();
        html += `<blockquote>${inline(escapeHtml(line.replace(/^>\s?/, "")))}</blockquote>`;
        index += 1;
        continue;
      }

      // unordered list
      if (/^[-*]\s+/.test(line)) {
        openList("ul");
        html += `<li>${inline(escapeHtml(line.replace(/^[-*]\s+/, "")))}</li>`;
        index += 1;
        continue;
      }

      // ordered list
      if (/^\d+\.\s+/.test(line)) {
        openList("ol");
        html += `<li>${inline(escapeHtml(line.replace(/^\d+\.\s+/, "")))}</li>`;
        index += 1;
        continue;
      }

      // a line that is entirely bold acts like a small heading
      if (/^\*\*[^*]+\*\*$/.test(line)) {
        closeList();
        html += `<p class="lead">${inline(escapeHtml(line))}</p>`;
        index += 1;
        continue;
      }

      // paragraph
      closeList();
      const paragraph = [line];
      index += 1;

      while (
        index < lines.length &&
        !/^\s*$/.test(lines[index]) &&
        !/^\s*(```|#{1,3}\s|>|[-*]\s|\d+\.\s)/.test(lines[index])
      ) {
        paragraph.push(lines[index]);
        index += 1;
      }

      html += `<p>${inline(escapeHtml(paragraph.join(" ")))}</p>`;
    }

    closeList();
    return html;
  }

  /* ---------- reply content ---------- */

  function excerpt(prompt) {
    const clean = String(prompt)
      .replace(/[*`#>_~]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (clean.length <= 88) return clean;
    return clean.slice(0, 85).trimEnd() + "…";
  }

  function quantumReply() {
    return {
      content: [
        "**Quantum computing, without the hand-waving**",
        "",
        "A classical bit is a light switch: **0** or **1**. A qubit is closer to a coin spinning on a table — while it spins, it is *both* faces at once, and it can interfere with other spinning coins.",
        "",
        "**The three ideas that actually matter**",
        "- **Superposition** — a qubit holds a weighted blend of 0 and 1 until you measure it.",
        "- **Entanglement** — two qubits can share one state, so measuring one tells you about the other.",
        "- **Interference** — the real superpower. Algorithms arrange the probabilities so wrong answers cancel and right answers add up.",
        "",
        `${FENCE}python`,
        "from qiskit import QuantumCircuit",
        "",
        "qc = QuantumCircuit(1)",
        "qc.h(0)                 # |0> -> (|0> + |1>) / sqrt(2)",
        "qc.measure_all()",
        "print(qc.draw())",
        FENCE,
        "",
        "**Where it wins:** molecule simulation, cryptography, some optimization problems.",
        "**Where it doesn't (yet):** your CRUD app, your spreadsheet, most everyday code.",
        "",
        "> The honest summary: it's a specialized accelerator, not a faster CPU.",
      ].join("\n"),
      thinking: THINKING,
      followups: [
        "What is a Bell state?",
        "When will it break RSA?",
        "Explain it with an analogy",
      ],
    };
  }

  function codeReply() {
    return {
      content: [
        "I'd fix this in two passes: make the failure reproducible, then delete the assumption that's breaking.",
        "",
        "**1. Reproduce it on demand**",
        "Run the test in a loop and log the seed. If it only fails in the full suite, you have **shared state** — a module-level cache, a fixture with the wrong scope, or a clock that isn't frozen.",
        "",
        `${FENCE}bash`,
        "pytest tests/test_orders.py -k flaky --count=20 -p no:randomly",
        FENCE,
        "",
        "**2. The usual suspects**",
        "- `scope=\"session\"` fixtures mutating objects other tests reuse",
        "- `datetime.now()` instead of an injected clock",
        "- assertions on dict or set ordering",
        "- async tasks that outlive the test",
        "",
        "**A pattern that fixes most of them**",
        `${FENCE}python`,
        "from dataclasses import dataclass, field",
        "from datetime import datetime",
        "from typing import Callable",
        "",
        "@dataclass",
        "class OrderService:",
        "    clock: Callable[[], datetime] = datetime.utcnow",
        "    _cache: dict = field(default_factory=dict)  # fresh per instance",
        "",
        "    def total(self, items):",
        "        now = self.clock()",
        "        ...",
        FENCE,
        "",
        "Inject the clock, create the cache per instance, and the flake usually disappears.",
        "",
        "Paste the failing test and the fixture it uses — I'll point at the exact line.",
      ].join("\n"),
      thinking: THINKING,
      followups: [
        "Here's my traceback",
        "How do I freeze time in pytest?",
        "Write the fixed test",
      ],
    };
  }

  function siteReply() {
    return {
      content: [
        "Let's build it in layers so it looks good before it gets clever.",
        "",
        "**The structure that converts**",
        "1. **Hero** — one promise, one primary action. No carousel, no stock photo.",
        "2. **Proof** — logos, numbers, or a short quote directly under the fold.",
        "3. **How it works** — three steps, scannable in under ten seconds.",
        "4. **Objection handling** — pricing, FAQ, guarantees.",
        "5. **Final CTA** — repeat the hero action in different words.",
        "",
        "**A hero skeleton you can ship today**",
        `${FENCE}html`,
        '<section class="hero">',
        '  <p class="eyebrow">Built for small teams</p>',
        "  <h1>Ship your idea before the weekend.</h1>",
        '  <p class="sub">One workspace for design, code, and feedback.</p>',
        '  <a class="btn" href="#start">Start free</a>',
        '  <p class="fineprint">No card. Cancel anytime.</p>',
        "</section>",
        FENCE,
        "",
        "**Motion that helps (not decorates)**",
        "- Stagger the hero in over 400ms, once.",
        "- Animate the primary button on hover — nothing else needs to move.",
        "- Always respect `prefers-reduced-motion`.",
        "",
        "Tell me the product and the audience and I'll write the actual copy.",
      ].join("\n"),
      thinking: THINKING,
      followups: [
        "Write the copy for an AI startup",
        "Give me a color palette",
        "Review my current hero",
      ],
    };
  }

  function neuralReply() {
    return {
      content: [
        "**A neural network is a stack of very confident guesses**",
        "",
        "Strip away the mystique and it's this: a pile of numbers (weights) multiplied by your input, squashed through a non-linearity, then adjusted whenever the output is wrong.",
        "",
        "**The loop, in four steps**",
        "1. **Forward pass** — push data through the layers and get a prediction.",
        "2. **Loss** — measure how wrong it was.",
        "3. **Backward pass** — use the chain rule to see which weights caused the error.",
        "4. **Update** — nudge every weight a little in the right direction.",
        "",
        "Repeat a few million times and the network starts to look like it understands.",
        "",
        `${FENCE}python`,
        "for x, y in batches:",
        "    pred = model(x)",
        "    loss = criterion(pred, y)",
        "    loss.backward()",
        "    optimizer.step()",
        "    optimizer.zero_grad()",
        FENCE,
        "",
        "**The honest part:** nobody fully knows what the middle layers learn. We know they work, and we know how to steer them — which is most of the job.",
        "",
        "> If you're learning this: build a tiny one from scratch before you touch a framework.",
      ].join("\n"),
      thinking: THINKING,
      followups: [
        "Build a tiny net from scratch",
        "What is backpropagation?",
        "Transformers vs CNNs",
      ],
    };
  }

  function writingReply() {
    return {
      content: [
        "**Writing that doesn't sound like a robot**",
        "",
        "The fastest fix is almost always the same: say the true thing in the fewest words, then cut the throat-clearing.",
        "",
        "**Before**",
        "> In today's fast-paced digital landscape, we are excited to announce the launch of our innovative new platform.",
        "",
        "**After**",
        "> We built a faster way to ship. It's live today.",
        "",
        "**The checklist I use**",
        "- Lead with the point, not the context.",
        "- One idea per sentence.",
        "- Replace adjectives with evidence.",
        "- Read it out loud. If you stumble, rewrite it.",
        "- Delete the last sentence — it's usually a summary you didn't need.",
        "",
        "Paste your draft and tell me who it's for. I'll rewrite it in your voice, not mine.",
      ].join("\n"),
      thinking: THINKING,
      followups: [
        "Rewrite my draft",
        "Make it more casual",
        "Write a cold email",
      ],
    };
  }

  function tripReply() {
    return {
      content: [
        "**7 days in Tokyo, one bag, zero rush**",
        "",
        "Base yourself in one neighborhood — Shimokitazawa or Asakusa — and take the train. You'll spend less and see more.",
        "",
        "**Day 1 — Land and go slow**",
        "Check in, walk the neighborhood, konbini dinner. Fight the urge to \"just see one thing.\"",
        "",
        "**Day 2 — Asakusa & Sumida**",
        "Senso-ji at 7am (empty), coffee in Kuramae, river walk at sunset.",
        "",
        "**Day 3 — Shibuya & Shinjuku**",
        "Scramble crossing, Miyashita Park, then Golden Gai after dark.",
        "",
        "**Day 4 — Day trip to Kamakura**",
        "Great Buddha, bamboo temple, back by 6pm.",
        "",
        "**Day 5 — Food day**",
        "Tsukiji outer market breakfast, ramen for lunch, yakitori alley for dinner.",
        "",
        "**Day 6 — Art & design**",
        "teamLab (book ahead), then Daikanyama for bookshops and coffee.",
        "",
        "**Day 7 — Last loop**",
        "Meiji Jingu at dawn, Harajuku, souvenir run, early night.",
        "",
        "**Budget sketch**",
        "- Hostel or 3-star: ¥6,000–12,000 / night",
        "- Food: ¥3,000–5,000 / day",
        "- Transit: ~¥1,000 / day (get a Suica)",
        "- Week total: roughly ¥120,000–160,000, excluding flights",
        "",
        "Want this as a checklist with neighborhoods and addresses?",
      ].join("\n"),
      thinking: THINKING,
      followups: [
        "Turn this into a checklist",
        "Where should I stay?",
        "What should I pack?",
      ],
    };
  }

  function identityReply() {
    return {
      content: ["I'm **Cortex**, made by **Qstar**!"].join("\n"),
      thinking: THINKING,
      followups: [
        "What can you do?",
        "How does DeepThink work?",
        "Show me an example",
      ],
    };
  }

  function greetingReply() {
    return {
      content: [
        "Hey — good to see you.",
        "",
        "I'm **Cortex**. Throw me a half-formed idea, a stack trace, or a blank page and we'll make something out of it.",
        "",
        "A few things people start with:",
        "- \"Explain this like I'm smart but new.\"",
        "- \"Rewrite this so it doesn't sound like a robot.\"",
        "- \"Here's my code — find the bug.\"",
        "",
        "Where do you want to start?",
      ].join("\n"),
      thinking: THINKING,
      followups: [
        "Help me brainstorm",
        "Explain something hard",
        "Write something for me",
      ],
    };
  }

  function jokeReply() {
    return {
      content: [
        "Why did the neural network break up with the spreadsheet?",
        "",
        "Because it had **too many hidden layers** and not enough chemistry.",
        "",
        "…I'll see myself out. Want a better one, or should we get back to work?",
      ].join("\n"),
      thinking: THINKING,
      followups: ["Another one", "Okay, back to work", "Explain a neural net"],
    };
  }

  function genericReply(prompt) {
    const topic = excerpt(prompt);

    return {
      content: [
        `Here's how I'd think about **${topic}**.`,
        "",
        "**Start with the shape of the problem**",
        "Write down what \"done\" looks like in one sentence. If you can't, the task is still two tasks wearing a trench coat.",
        "",
        "**Then make it small**",
        "- Pick the smallest version that could possibly work.",
        "- Ship it to one real person.",
        "- Watch where they hesitate — that's your roadmap.",
        "",
        "**Then make it good**",
        "Polish only the parts people actually touch. Everything else is decoration.",
        "",
        "> Give me the constraints — time, audience, tools — and I'll turn this into a concrete plan with steps.",
      ].join("\n"),
      thinking: THINKING,
      followups: [
        "Make it a checklist",
        "What would you do first?",
        "Give me a concrete example",
      ],
    };
  }

  const MATCHERS = [
    { test: /^(who are you|what are you|what is your name|what's your name|what model are you|what is your model|what model|what ai are you|what ai)\b/i, build: identityReply },
    { test: /^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/i, build: greetingReply },
    { test: /(joke|make me laugh|something funny)/i, build: jokeReply },
    { test: /(quantum|qubit|superposition|entangle)/i, build: quantumReply },
    { test: /(python|traceback|flaky|debug|stack trace|unit test|pytest|bug in)/i, build: codeReply },
    { test: /(landing page|website|web page|homepage|html|css|design a site|ui design)/i, build: siteReply },
    { test: /(neural|deep learning|machine learning|transformer|backprop|llm)/i, build: neuralReply },
    { test: /(trip|travel|itinerary|vacation|holiday|tokyo|days? in)/i, build: tripReply },
    { test: /(write|rewrite|email|headline|tagline|draft|essay|copywriting)/i, build: writingReply },
  ];

  function reply(prompt) {
    const text = String(prompt || "").trim();
    const match = MATCHERS.find((matcher) => matcher.test.test(text));
    const result = match ? match.build() : genericReply(text);

    return {
      content: result.content,
      thinking: result.thinking || THINKING,
      followups: result.followups || [],
    };
  }

  /* ---------- NVIDIA NIM ---------- */
  const NIM_ENDPOINT = new URL("/api/nim", document.baseURI).href;
  const NIM_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
  const NIM_SYSTEM_PROMPT =
    "You are Cortex, a calm, direct, and helpful AI assistant. " +
    "Answer in the requested language with clear, unformatted plain prose only. " +
    "Keep the answer short. Do not use markdown, markup, thinking tags, code fences, bold text, headings, or bullets.";

  function trimHistory(history) {
    const rows = [];

    for (const item of history || []) {
      if (!item || typeof item !== "object") continue;
      if (item.role !== "user" && item.role !== "assistant") continue;
      if (!item.content) continue;

      rows.push({
        role: item.role,
        content: String(item.content).slice(0, 4000),
      });
    }

    return rows.slice(-10);
  }

  async function nimReply(prompt, history = []) {
    try {
      const text = String(prompt || "").trim();
      const identityPattern = /^(who are you|what are you|what is your name|what's your name|what model are you|what is your model|what model|what ai are you|what ai)\b/i;

      if (identityPattern.test(text)) {
        return identityReply();
      }
      const response = await fetch(NIM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          model: NIM_MODEL,
          messages: [
            { role: "system", content: NIM_SYSTEM_PROMPT },
            ...trimHistory(history),
            { role: "user", content: String(prompt || "").slice(0, 4000) },
          ],
          temperature: 0.4,
          top_p: 0.8,
          frequency_penalty: 0,
          presence_penalty: 0,
          max_tokens: 1024,
          chat_template_kwargs: {
            enable_thinking: false,
          },
          stream: false,
        }),
      });

      if (!response.ok) throw new Error(`NIM ${response.status}`);

      const data = await response.json();
      const message = data?.choices?.[0]?.message || {};
      const reasoning =
        message.reasoning ||
        message.reasoning_content ||
        message.thinking ||
        message.thought ||
        null;
      const content =
        message.content || reasoning || "";

      if (!String(content).trim()) throw new Error("Empty NIM reply");

      return { content: String(content), thinking: null, followups: [] };
    } catch (error) {
      console.warn("NIM unreachable — using local demo reply", error);
      const fallback = reply(prompt);
      return { ...fallback, fallback: true };
    }
  }

  window.CortexChat = {
    reply,
    replyAsync: nimReply,
    render,
    escapeHtml,
    thinking: THINKING,
  };
})();
