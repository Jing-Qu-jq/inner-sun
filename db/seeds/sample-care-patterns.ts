// SAMPLE, synthetic Care Patterns for Feature 3 — enough to demonstrate that vector
// search works against seed rows. These are NOT the real knowledge base: Feature 6
// loads the authored starter set (≥ 8–10 patterns) and embeds them with OpenAI.
//
// Authored in English (per the architecture). De-identified / clearly synthetic — no PHI.
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
