# Course content authoring guide

All content is **original** and written for the Pearson Edexcel A level Economics A specification
(9EC0, AS 8EC0). Never copy Pearson questions, mark schemes, examiner reports or textbook text.
The goal is A* standard: every lesson should take a student from first principles to
top-band (Level 4) analysis and evaluation.

Validate any file with `node scripts/validate-content.mjs <file>` until it prints `OK`.

## Facts and data

- Use real UK and global examples (Soft Drinks Industry Levy, National Living Wage, Bank of England
  MPC, UK ETS, CMA cases, etc.) but only state statistics you are confident are right, phrased with
  "around" / "roughly" and a year. Never invent sources or quotes.
- Data-response extracts use **fictional** places/firms or are labelled "(illustrative data)", as in
  `seed/questions.json`.
- British English (labour, behaviour, programme), £, UK terminology (Bank Rate, CPI, HMRC).
- Plain text only. In lesson `body` fields you may use blank lines between paragraphs, lines starting
  with `- ` for bullets, and `**bold**`. No HTML, no Markdown headings, no tables except in
  `context` (use `Col | Col` rows as in `seed/questions.json`).

## Lessons — `seed/lessons/<file>.json` (an array)

```json
{
  "topic_code": "1.2.3",
  "title": "Price, income and cross elasticities of demand",   // exactly the title in src/lib/spec.ts
  "minutes": 60,                                                // realistic study time, 30–120
  "overview": "2–4 sentences: what this topic is and why it matters in the exam.",
  "objectives": ["By the end you can …", "..."],                // 3–7
  "sections": [                                                 // 3–8 teaching sections, the core notes
    { "heading": "What PED measures", "body": "Paragraphs, - bullets, **bold**. Explain from first principles, build to exam depth. 150–400 words each." }
  ],
  "key_terms": [{ "term": "Price elasticity of demand", "definition": "Precise exam-ready definition." }],   // 4–15
  "diagrams": [ /* 0–4, see Diagram spec; include every diagram a student must be able to draw for this topic */ ],
  "formulae": [{ "name": "PED", "formula": "% change in quantity demanded ÷ % change in price", "example": "Worked numeric example" }],  // optional
  "applications": ["Real-world application paragraph (UK first, then global).", "..."],   // 2–6
  "evaluation": ["Evaluation angle an A* answer would use: magnitude, time period, assumptions, stakeholders, it depends on …"],  // 3–8
  "misconceptions": ["Common mistake and the correction."],   // 2–6
  "exam_tips": ["How this is examined on Edexcel papers and how to pick up marks (KAA / evaluation)."],  // 2–6
  "model_answer": {
    "question": "An exam-style question (8, 10, 12, 15 or 25 marks for analysis/evaluation topics).",
    "marks": 12,
    "answer": "A full top-band answer written as a strong student would write it in the exam: definitions, application, chains of analysis, diagram reference, evaluation and a justified judgement.",
    "commentary": "Why this reaches the top level, mapped to Knowledge, Application, Analysis, Evaluation."
  },
  "check": [                                                     // 3–6 quick self-check MCQs
    { "q": "Question", "options": ["opt 1", "opt 2", "opt 3", "opt 4"], "answer": "B", "explanation": "Why." }
  ],
  "synoptic": ["2.6.2", "4.5.2"]                                 // related spec codes for synoptic links
}
```

Check-question `options` must **not** start with a letter (the app adds A–D).

### Diagram spec

Coordinates run 0–10 on both axes (origin bottom-left). The app draws axes, lines (smoothed through the
points when `"curve": true`), labels at the end of each line, points with optional dashed guide lines
to both axes, shaded areas and arrows.

```json
{
  "title": "Increase in demand",
  "x": "Quantity", "y": "Price",
  "lines": [
    { "label": "S", "points": [[1, 1.5], [9, 8.5]] },
    { "label": "D1", "points": [[1, 8.5], [8, 1.5]] },
    { "label": "D2", "points": [[3, 9.5], [9.5, 3]], "style": "shift" },      // style: solid | dashed | shift (highlight)
    { "label": "LRAC", "points": [[1, 8], [4, 4], [7, 3.5], [9.5, 6]], "curve": true }
  ],
  "points": [ { "x": 4.9, "y": 5.4, "label": "E1", "guides": true, "xlabel": "Q1", "ylabel": "P1" } ],
  "areas": [ { "points": [[0, 5.4], [4.9, 5.4], [0, 8.5]], "label": "CS" } ],
  "arrows": [ { "from": [6, 5], "to": [7.5, 6] } ],
  "caption": "One or two sentences explaining what the diagram shows."
}
```

Make the geometry correct: intersections must actually lie on both lines (compute them), shifts
must move the right way, MC must cut AC at its minimum, MR must be twice as steep as a linear AR,
and so on. Keep labels short (S, D1, MSC, AD2, LRAS, MC, AR=D).

## Mock papers — `seed/mocks/<id>.json` (one object per file)

```json
{
  "id": "a1-set-a",
  "paper": "A1",                    // AS1 | AS2 | A1 | A2 | A3
  "level": "A",                     // AS for AS1/AS2, A otherwise
  "title": "A level Paper 1 mock — Set A: Markets and business behaviour",
  "description": "One paragraph: what the paper covers, timing, how to approach it.",
  "duration_minutes": 120,          // 90 for AS, 120 for A level
  "questions": [
    { "id": "m-a1-set-a-01", "section": "A", "theme": 1, "topic_code": "1.2.3", "level": "A", "type": "mcq", "marks": 1,
      "prompt": "...", "options": ["A ...", "B ...", "C ...", "D ..."], "answer": "C", "explanation": "..." },
    { "id": "m-a1-set-a-06", "section": "A", "theme": 3, "topic_code": "3.3.2", "level": "A", "type": "short", "marks": 4,
      "prompt": "...", "mark_scheme": "..." },
    { "id": "m-a1-set-a-11", "section": "B", "theme": 3, "topic_code": "3.4.4", "level": "A", "type": "data", "marks": 5,
      "prompt": "With reference to Extract A, ...", "context": "Full shared extract, repeated identically on every part of this data response", "mark_scheme": "..." },
    { "id": "m-a1-set-a-16", "section": "C", "theme": 3, "topic_code": "3.4.5", "level": "A", "type": "essay", "marks": 25,
      "prompt": "Answer EITHER (a) OR (b). Start your answer by writing (a) or (b).\n\n(a) Evaluate ...\n\n(b) Evaluate ...", "mark_scheme": "Covers both options ..." }
  ]
}
```

MCQ `options` **must** start with `"A "`, `"B "`, `"C "`, `"D "`. Question order = paper order.

| Paper | Themes | Section A | Section B | Section C | Total |
|---|---|---|---|---|---|
| AS1 | 1 | 4 MCQ (1) + 4 short (4) = 20 | one data response, parts 5, 5, 8, 10, 12, 20 = 60 | — | 80 |
| AS2 | 2 | same as AS1 | same as AS1 | — | 80 |
| A1 | 1 & 3 | 5 MCQ (1) + 5 short (4) = 25 | one data response, parts 5, 8, 10, 12, 15 = 50 | one 25-mark essay, EITHER/OR | 100 |
| A2 | 2 & 4 | same as A1 | same as A1 | same as A1 | 100 |
| A3 | 1–4 synoptic | data response 1: parts 5, 8, 12 + 25-mark EITHER/OR essay = 50 | data response 2: same shape = 50 | — | 100 |

For A3 put the first data response in section `A` and the second in section `B`.

Mark schemes for 8+ mark questions must contain: indicative **Knowledge/Application**, **Analysis**
and **Evaluation** content, then the **level descriptors** with mark bands (e.g. for 25 marks:
KAA Level 1 1–4, Level 2 5–8, Level 3 9–12, Level 4 13–16; Evaluation Level 1 1–3, Level 2 4–6,
Level 3 7–9), and a final line `A* answer:` describing what a top answer does. 4–5 mark questions
list the specific marking points (e.g. "1 mark for definition, 2 marks for calculation, …").
Data-response parts must genuinely need the extract (calculations, references to figures).
