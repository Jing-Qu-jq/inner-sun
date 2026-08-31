import type { CrisisResource, Locale } from "@innersun/shared";

/**
 * Where a student in crisis is told to go (Feature 9 AC 2).
 *
 * This file is deliberately separate from the screening logic next door, because it is the
 * only part of this feature that is *clinical content* rather than engineering. It should be
 * read and signed off by the researchers the same way a Care Pattern is, and it is small and
 * self-contained so that reading it takes a minute.
 *
 * Three rules govern everything here, and each exists because of a specific way this can go
 * wrong in a mental-health product:
 *
 *   1. **No number ever passes through a language model.** The reply on a crisis turn is
 *      written by `gpt-4o`; these resources are not. A model asked to "give them a hotline"
 *      will confidently produce a plausible, wrong number — and a student who calls it gets
 *      a dead line at the worst possible moment. The crisis prompt therefore forbids the
 *      model from stating any number or URL, and this list is appended by the application.
 *   2. **The international directory leads.** InnerSun's students are, by definition, living
 *      somewhere other than where they grew up, and we do not know which country a given
 *      student is in. A US-only list is wrong for most of them. `findahelpline.com` resolves
 *      to the caller's own country, which is the only entry here that is right for everyone.
 *   3. **Emergency services are named first in the copy, not buried.** The single most useful
 *      instruction to someone in immediate danger is to call the local emergency number.
 *
 * ⚠️ **VERIFY BEFORE LAUNCH.** Every entry below is a real, widely published service, but
 * hotline numbers change, services close, and this list was assembled by an engineer rather
 * than a clinician. Before InnerSun is put in front of a real student, a researcher must
 * confirm each entry and decide whether the set is right for the population being served —
 * particularly which country-specific lines belong here at all. Recorded as an outstanding
 * item under Feature 9 in docs/PLAN.md.
 *
 * Localized here rather than in the browser so that the decision and the resources travel
 * together: a client told only "this is a crisis" could render nothing at all.
 */

/**
 * The resources, by locale.
 *
 * Same services in both languages, not different ones — a student reading InnerSun in
 * Chinese may well be studying in Manchester, and offering them only mainland Chinese lines
 * would be worse than useless. The Chinese list adds one mainland service, because a student
 * reading in Chinese is meaningfully more likely to be able to use it.
 */
const RESOURCES: Record<Locale, CrisisResource[]> = {
  en: [
    {
      name: "Local emergency services",
      contact: "911 (US) · 999 (UK) · 112 (EU) · 000 (AU) · 120 (China)",
      note: "If you are in immediate danger, call now.",
    },
    {
      name: "Find a Helpline",
      contact: "findahelpline.com",
      note: "Free, confidential helplines in your country, wherever you are studying.",
    },
    {
      name: "988 Suicide & Crisis Lifeline",
      contact: "Call or text 988",
      note: "United States — 24 hours, every day.",
    },
    {
      name: "Samaritans",
      contact: "116 123",
      note: "United Kingdom and Ireland — free, 24 hours, every day.",
    },
  ],
  "zh-CN": [
    {
      name: "当地紧急服务",
      contact: "美国 911 · 英国 999 · 欧盟 112 · 澳大利亚 000 · 中国 120",
      note: "如果你现在有危险，请立刻拨打。",
    },
    {
      name: "Find a Helpline（全球求助热线查询）",
      contact: "findahelpline.com",
      note: "按所在国家查找免费、保密的热线，无论你在哪里念书。",
    },
    {
      name: "北京心理危机研究与干预中心热线",
      contact: "010-8295-1332",
      note: "中国大陆 — 24 小时。",
    },
    {
      name: "988 Suicide & Crisis Lifeline",
      contact: "拨打或发短信至 988",
      note: "美国 — 24 小时，提供中文服务。",
    },
    {
      name: "Samaritans",
      contact: "116 123",
      note: "英国和爱尔兰 — 免费，24 小时。",
    },
  ],
};

/** The resources to show a student being answered in this language. */
export function crisisResources(locale: Locale): CrisisResource[] {
  return RESOURCES[locale] ?? RESOURCES.en;
}

/**
 * What the student is told when the model itself could not answer (Feature 9).
 *
 * A crisis turn whose `gpt-4o` call fails must NOT become the ordinary "something went
 * wrong, please try again" bubble. That is the one turn where an error message is an actual
 * safety failure: the student has just disclosed something serious and the app answers with
 * a shrug. So the turn degrades to this fixed text plus the resource list, and is recorded
 * in the transcript as what the student actually saw.
 *
 * Written to be true regardless of what was said — it acknowledges, it does not interpret.
 */
const FALLBACK_REPLY: Record<Locale, string> = {
  en:
    "Thank you for telling me that. I'm having trouble responding properly right now, and I " +
    "don't want that to leave you without help. Please reach one of the services below — " +
    "there are real people there, right now, and you deserve to talk to one of them. If you " +
    "are in immediate danger, call your local emergency number.",
  "zh-CN":
    "谢谢你告诉我这些。我现在没办法好好回应你，但我不希望这让你得不到帮助。" +
    "请联系下面的任意一个服务——那里现在就有真人在，你值得和他们聊一聊。" +
    "如果你此刻有危险，请立即拨打当地的紧急电话。",
};

export function crisisFallbackReply(locale: Locale): string {
  return FALLBACK_REPLY[locale] ?? FALLBACK_REPLY.en;
}
