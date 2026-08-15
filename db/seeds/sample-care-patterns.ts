// The starter Care Pattern set (Feature 6) — 12 situations covering common international
// student experiences, embedded for real with text-embedding-3-small on seed.
//
// ⚠️  THESE ARE SCAFFOLDING, NOT THE KNOWLEDGE BASE. Every pattern here is synthetic and
// de-identified (no PHI), and every `sourceRefs` entry is a placeholder rather than a real
// citation. They exist so retrieval has semantically distinct rows to match against, and
// so the admin UI has something to display on first run. The researcher replaces them with
// clinically authored patterns carrying real paper references, via the Feature 17 tool.
//
// Once that tool is live the DATABASE is the source of truth and this file is only used to
// bootstrap a fresh environment; `npm run db:export:patterns` writes the live set back to
// the repo as a version-controlled backup.
//
// Authored in English, per docs/ARCHITECTURE.md — matching happens in English and replies
// are translated, so `localeNotes` is the one place other languages belong.
// Fixed UUIDs make the seed idempotent (insert ... on conflict (id) do update).

export interface SampleCarePattern {
  id: string;
  title: string;
  situation: string;
  signals: string[];
  strategies: string[];
  avoid: string[];
  escalation: string;
  sourceRefs: string[];
  localeNotes: Record<string, string>;
}

export const sampleCarePatterns: SampleCarePattern[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Homesickness & cultural adjustment",
    situation:
      "An international student feels homesick and isolated after moving abroad, missing family, food, and familiar routines while adjusting to a new culture.",
    signals: ["mentions missing home or family", "feeling out of place", "comparing here vs. home"],
    strategies: [
      "Validate that homesickness is a normal part of cultural transition.",
      "Encourage small routines that blend the familiar with the new environment.",
      "Explore one concrete connection to make this week (a club, a call home, a shared meal).",
    ],
    avoid: ["dismissing the feeling as something they'll just 'get over'", "minimizing cultural loss"],
    escalation: "If low mood persists for weeks and impairs daily functioning, suggest a human counselor.",
    sourceRefs: ["SAMPLE-REF: acculturation & student wellbeing (placeholder citation)"],
    localeNotes: { "zh-CN": "留学生想家、思念家乡饮食与家人时的常见适应问题。" },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Academic stress in a non-native language",
    situation:
      "A student is overwhelmed by coursework and exams taught in a language that is not their first, feeling behind peers and doubting their ability to keep up.",
    signals: ["mentions deadlines or exams", "language barrier in lectures", "self-doubt about ability"],
    strategies: [
      "Normalize the extra cognitive load of studying in a second language.",
      "Break work into small, time-boxed steps to reduce overwhelm.",
      "Reframe struggle as skill-building, not evidence of inadequacy.",
    ],
    avoid: ["comparing them to native speakers", "piling on more to-dos"],
    escalation: "If stress becomes hopelessness or panic that blocks functioning, suggest a human counselor.",
    sourceRefs: ["SAMPLE-REF: second-language academic anxiety (placeholder citation)"],
    localeNotes: { "zh-CN": "用非母语学习、面对考试与课业压力时的焦虑。" },
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Making friends & social belonging",
    situation:
      "A student struggles to build a social circle in a new country, feels lonely, and worries they don't fit in or that reaching out will be awkward.",
    signals: ["mentions loneliness", "difficulty making friends", "fear of rejection or awkwardness"],
    strategies: [
      "Affirm that building belonging abroad takes time and is a shared experience.",
      "Suggest low-pressure, interest-based ways to meet people (clubs, study groups).",
      "Practice one small, specific social step and reflect on it next time.",
    ],
    avoid: ["telling them to 'just put themselves out there'", "implying the loneliness is their fault"],
    escalation: "If isolation deepens into withdrawal or persistent sadness, suggest a human counselor.",
    sourceRefs: ["SAMPLE-REF: social belonging & international students (placeholder citation)"],
    localeNotes: { "zh-CN": "在异国交友困难、缺乏归属感的孤独感。" },
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    title: "Visa & immigration status anxiety",
    situation:
      "A student is anxious about their visa or immigration status — worrying about paperwork deadlines, whether a mistake could end their studies, or what happens if their situation changes.",
    signals: [
      "mentions visa, permit or immigration paperwork",
      "fear of being sent home or losing status",
      "anxiety tied to a specific administrative deadline",
    ],
    strategies: [
      "Acknowledge that status uncertainty is a genuine stressor, not an overreaction.",
      "Separate what is within their control (paperwork, appointments) from what is not.",
      "Point them toward the university's international student office as the authoritative source.",
    ],
    avoid: [
      "giving legal or immigration advice of any kind",
      "guessing at rules or timelines",
      "reassuring them that it will definitely be fine",
    ],
    escalation:
      "If anxiety about status is dominating daily life or the question is legal, route to the international student office and suggest a human counselor.",
    sourceRefs: ["SAMPLE-REF: immigration stress & student wellbeing (placeholder citation)"],
    localeNotes: { "zh-CN": "签证与身份状态带来的焦虑；不提供法律建议，转介学校国际学生办公室。" },
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    title: "Financial pressure & the cost of studying abroad",
    situation:
      "A student is worried about money — tuition, rent, exchange rates, or the guilt of how much their family is spending to keep them here, and is cutting back on food or social life to cope.",
    signals: [
      "mentions tuition, rent or exchange rates",
      "guilt about family spending",
      "skipping meals or social events to save money",
    ],
    strategies: [
      "Take the practical worry seriously before addressing the feelings underneath it.",
      "Surface concrete campus resources: hardship funds, food pantries, financial aid advising.",
      "Gently separate their financial situation from their sense of worth or obligation.",
    ],
    avoid: [
      "suggesting they simply spend less",
      "treating the worry as purely emotional when it is also material",
      "recommending work that could jeopardize visa conditions",
    ],
    escalation:
      "If they are skipping meals, facing housing insecurity, or expressing hopelessness about money, route to student support services and a human counselor.",
    sourceRefs: ["SAMPLE-REF: financial stress in international student populations (placeholder citation)"],
    localeNotes: { "zh-CN": "学费、生活费与汇率压力，以及对家庭经济付出的愧疚感。" },
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    title: "Family expectations & fear of disappointing parents",
    situation:
      "A student feels the weight of their family's hopes — that their grades, major, or career path must justify the sacrifice made for them — and cannot admit to struggling without feeling they have failed everyone.",
    signals: [
      "mentions parents' expectations or sacrifice",
      "reluctance to tell family about difficulties",
      "framing their own needs as selfish",
    ],
    strategies: [
      "Name the double burden: carrying the difficulty and hiding it at the same time.",
      "Explore what they want, separately from what is expected, without forcing a choice.",
      "Consider what a small, safe piece of honesty with family might look like.",
    ],
    avoid: [
      "criticizing their family or culture",
      "pushing them to confront or defy their parents",
      "treating filial obligation as merely a problem to overcome",
    ],
    escalation:
      "If the pressure produces hopelessness or they feel there is no acceptable way forward, suggest a human counselor.",
    sourceRefs: ["SAMPLE-REF: family expectations & acculturative stress (placeholder citation)"],
    localeNotes: {
      "zh-CN": "家庭期望与「不能让父母失望」的压力；需尊重孝道文化，避免直接鼓励对抗父母。",
    },
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    title: "Discrimination & microaggressions",
    situation:
      "A student has been treated differently because of their accent, appearance, or nationality — through jokes, exclusion, or assumptions about their ability — and is unsure whether to name it or let it go.",
    signals: [
      "describes comments about accent, name or appearance",
      "being talked over or assumed less competent",
      "doubting whether the incident 'counts'",
    ],
    strategies: [
      "Believe them, and say plainly that what happened was not acceptable.",
      "Resist the urge to explain the other person's intent; focus on the impact on them.",
      "Let them decide whether to report, respond, or step back — support the choice either way.",
    ],
    avoid: [
      "suggesting they misread the situation",
      "offering the other person's likely good intentions as comfort",
      "pushing them to report before they are ready",
    ],
    escalation:
      "If the incident involves harassment, threats, or a pattern of targeted behavior, surface formal university reporting channels alongside a human counselor.",
    sourceRefs: ["SAMPLE-REF: racial microaggressions & campus climate (placeholder citation)"],
    localeNotes: { "zh-CN": "因口音、外貌或国籍受到的歧视与微歧视；先肯定其感受，不为对方开脱。" },
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    title: "Sleep disruption & living across time zones",
    situation:
      "A student's sleep is broken because their life runs on two clocks — staying up late to call family back home, then struggling through morning classes exhausted and foggy.",
    signals: [
      "mentions calls home late at night or early morning",
      "tiredness affecting classes or concentration",
      "an inverted or irregular schedule",
    ],
    strategies: [
      "Recognize that the calls are a lifeline, not a bad habit to be eliminated.",
      "Look for a sustainable rhythm — a fixed weekly call rather than nightly improvisation.",
      "Protect one anchor: a consistent wake time matters more than a consistent bedtime.",
    ],
    avoid: [
      "telling them to stop calling home",
      "generic sleep-hygiene advice that ignores the time-zone constraint",
    ],
    escalation:
      "If exhaustion is accompanied by persistent low mood or they cannot function in daily activities, suggest a human counselor.",
    sourceRefs: ["SAMPLE-REF: sleep, circadian disruption & student functioning (placeholder citation)"],
    localeNotes: { "zh-CN": "跨时区与家人联系导致的作息紊乱；不要建议减少与家人的联系。" },
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    title: "Imposter feelings in a competitive program",
    situation:
      "A student believes they were admitted by mistake and that their classmates are all more capable, so they stay quiet in seminars and avoid asking questions in case it exposes them.",
    signals: [
      "describes themselves as the least capable in the room",
      "avoids speaking up or asking for help",
      "attributes their successes to luck or an admissions error",
    ],
    strategies: [
      "Name the pattern: competence and the feeling of competence often move separately.",
      "Look for concrete evidence of their own work that the feeling is ignoring.",
      "Reframe asking questions as what strong students do, not what weak ones reveal.",
    ],
    avoid: [
      "simply insisting they are good enough",
      "comparing them favorably to peers, which keeps the ranking frame alive",
    ],
    escalation:
      "If self-doubt has become persistent worthlessness or is stopping them attending, suggest a human counselor.",
    sourceRefs: ["SAMPLE-REF: impostor phenomenon in graduate education (placeholder citation)"],
    localeNotes: { "zh-CN": "在竞争激烈的项目中产生的冒名顶替感与自我怀疑。" },
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Strain on a long-distance relationship",
    situation:
      "A student's relationship with a partner back home is under strain from distance and time zones — conversations feel thinner, they argue more, or they feel guilty for building a life their partner is not part of.",
    signals: [
      "mentions a partner in another country",
      "arguments about time, attention or the future",
      "guilt about new friendships or experiences",
    ],
    strategies: [
      "Validate that distance changes a relationship even when the feelings are unchanged.",
      "Explore what connection could look like now, rather than restoring what it was.",
      "Make room for both grief about the distance and permission to build a life here.",
    ],
    avoid: [
      "advising them to end or preserve the relationship",
      "framing their new life as a betrayal or the relationship as an obstacle",
    ],
    escalation:
      "If the relationship involves controlling behavior, coercion or fear, prioritize safety resources and a human counselor.",
    sourceRefs: ["SAMPLE-REF: long-distance relationships & student adjustment (placeholder citation)"],
    localeNotes: { "zh-CN": "异国恋因距离与时差产生的压力，以及对建立新生活的愧疚。" },
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    title: "Stigma about seeking mental health support",
    situation:
      "A student is struggling but reluctant to seek counseling — worried it means something is seriously wrong with them, that it could affect their record or visa, or that their family would not understand.",
    signals: [
      "asks whether their problem is 'bad enough' for help",
      "worries about confidentiality, records or immigration consequences",
      "says mental health is not discussed in their family or culture",
    ],
    strategies: [
      "Normalize support as something people use to cope well, not only in crisis.",
      "Address the specific fear they raise — confidentiality, cost, records — concretely.",
      "Lower the stakes: a first conversation is information gathering, not a commitment.",
    ],
    avoid: [
      "dismissing the stigma as irrational",
      "pressuring them toward an appointment before the concern is addressed",
      "making confidentiality promises beyond what the service actually offers",
    ],
    escalation:
      "If they are struggling significantly but declining support, keep the door open and make the human hand-off as low-friction as possible.",
    sourceRefs: ["SAMPLE-REF: help-seeking stigma among international students (placeholder citation)"],
    localeNotes: {
      "zh-CN": "对心理咨询的顾虑与病耻感，担心影响学籍、签证或家人看法；需正面回应具体顾虑。",
    },
  },
  {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    title: "Uncertainty about life after graduation",
    situation:
      "A final-year student is preoccupied with what happens when their studies end — whether they can stay and work, whether to return home, and feeling behind peers who seem to have it settled.",
    signals: [
      "mentions graduation, job applications or work authorization",
      "torn between staying and returning home",
      "comparing their progress to classmates'",
    ],
    strategies: [
      "Separate the practical questions from the identity question underneath them.",
      "Bring the horizon closer: what is the next decision, rather than the whole future.",
      "Point to careers services and the international office for authorization specifics.",
    ],
    avoid: [
      "advising on work authorization or immigration routes",
      "implying one choice — staying or returning — is the successful one",
    ],
    escalation:
      "If uncertainty becomes persistent dread, hopelessness, or paralysis about acting, suggest a human counselor.",
    sourceRefs: ["SAMPLE-REF: career transition & post-study uncertainty (placeholder citation)"],
    localeNotes: { "zh-CN": "毕业后去留与工作签证的不确定感；不提供移民或法律建议。" },
  },
];

export interface SampleCannedResponse {
  key: string;
  question: Record<string, string>;
  answer: Record<string, string>;
}

export const sampleCannedResponses: SampleCannedResponse[] = [
  {
    key: "is_confidential",
    question: { en: "Is this confidential?", "zh-CN": "对话内容保密吗？" },
    answer: {
      en: "Your chat is private. This is a supportive space, not medical care. See our privacy notice for details.",
      "zh-CN": "你的对话是私密的。这里是一个支持性的空间，而非医疗服务。详情请见隐私说明。",
    },
  },
  {
    key: "book_counselor",
    question: { en: "How do I book a real counselor?", "zh-CN": "如何预约真人咨询师？" },
    answer: {
      en: "You can ask to talk to a human anytime and we'll help you request a session with a real counselor.",
      "zh-CN": "你随时可以要求与真人交流，我们会帮你预约真人咨询师的会谈。",
    },
  },
];
