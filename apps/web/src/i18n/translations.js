// UI string resources. Add a new locale by adding another top-level key with
// the same set of keys — the language switch and <LanguageProvider> pick it up
// automatically. Care-Pattern / AI-reply localization is handled server-side
// (see the build plan, Feature 15); this file covers static UI copy only.

export const translations = {
    en: {
        'nav.home': 'Home',
        'nav.startChatting': 'Start Chatting',
        'nav.meetTeam': 'Meet Our Team',
        'nav.language': 'Language',
        'nav.login': 'Login',

        'hero.title': 'You’re not alone, wherever home is',
        'hero.lead':
            'Warm, culturally-aware emotional support for international students. Anonymous, secure, and here whenever you need it — in English or 中文.',
        'hero.ctaChat': 'Start chatting',
        'hero.ctaCounselors': 'Meet our counselors',

        'how.title': 'How it works',
        'how.subtitle':
            'Support in three simple steps — from your first message to talking with a real person.',
        'how.s1.title': 'Share what’s on your mind',
        'how.s1.body':
            'Start a private conversation — no sign-up needed. Chat anonymously, anytime, in the language you’re most comfortable with.',
        'how.s2.title': 'We understand your world',
        'how.s2.body':
            'InnerSun draws on guidance from researchers who study international-student wellbeing, and responds with warmth and cultural awareness.',
        'how.s3.title': 'Connect with a real counselor',
        'how.s3.body':
            'When you’re ready, we help you reach a human counselor who understands the experience of studying far from home.',

        'why.title': 'Why InnerSun',
        'why.subtitle':
            'A companion that actually gets what it’s like to be an international student.',
        'why.v1.title': 'Built for students abroad',
        'why.v1.body':
            'Homesickness, culture shock, academic pressure, visa stress — InnerSun understands the challenges of living and studying far from home.',
        'why.v2.title': 'Grounded in research',
        'why.v2.body':
            'Replies are shaped by clinician-authored guidance on international-student mental health — not generic chatbot answers.',
        'why.v3.title': 'Bilingual & always on',
        'why.v3.body':
            'Talk in English or 简体中文, any hour of the day — whenever the feeling hits, not just during office hours.',

        'map.title': 'Bridging home and here',
        'map.subtitle':
            'From campuses across the U.S. to families back in China and beyond — InnerSun keeps you connected to support that feels like home.',

        'trust.t1': '100% Anonymous',
        'trust.t2': 'Secure & Private',
        'trust.t3': 'Culturally Aware',
        'trust.t4': 'Here for You, Anytime',
        'trust.note':
            'InnerSun offers emotional support, not emergency care. If you’re in crisis, please contact your local emergency services or a crisis hotline right away.',

        'cta.title': 'Ready to talk?',
        'cta.text': 'It’s free to start, and completely anonymous.',
        'cta.chat': 'Start chatting',
        'cta.human': 'Talk to a human',

        'team.title': 'Meet Our Team',
        'team.sample':
            'Sample content — placeholder profiles and photos shown for preview. Real team members are coming soon.',

        'footer.tagline': 'AI psychological counseling assistant for international students',
        'footer.contact': 'Contact',
        'footer.emailLabel': 'Email',
        'footer.links': 'Links',
        'footer.privacy': 'Privacy Policy',
        'footer.terms': 'Terms of Service',
        'footer.rights': 'All rights reserved.',

        'chat.heading': 'What can I help you with?',
        'chat.subheading': 'Share whatever’s on your mind, this is a private, judgment-free space.',
        'chat.placeholder': 'Message InnerSun',
        'chat.send': 'Send',
        'chat.disclaimer': 'InnerSun offers supportive conversation, not medical advice or emergency care. If you’re in crisis, please contact your local emergency services.',
        'chat.starter.homesick': 'I’ve been feeling really homesick lately',
        'chat.starter.stress': 'I’m overwhelmed with academic pressure',
        'chat.starter.friends': 'It’s hard to make friends in a new country',
        'chat.starter.human': 'Can I talk to a real counselor?',
        // Shown in place of a reply when a turn fails (Feature 5).
        'chat.error': 'Sorry, something went wrong and your message didn’t get through. Please try again in a moment.',
        'chat.error.offline': 'We couldn’t reach InnerSun. Please check your connection and try again.',
        'chat.error.timeout': 'That took longer than expected and timed out. Please try sending it again.',
        'chat.error.busy': 'InnerSun is busy right now. Please try again in a moment.',

        // Retrieval inspector (Feature 22) — only ever rendered for a privileged viewer.
        'inspector.title': 'Retrieval inspector',
        'inspector.tokenLabel': 'Inspector token',
        'inspector.tokenHint': 'Ask an admin for the token, or set INSPECTOR_TOKEN on the API.',
        'inspector.unlock': 'Unlock',
        'inspector.checking': 'Checking…',
        'inspector.unlock.invalid': 'That token was not accepted by the API.',
        'inspector.unlock.not_configured':
            'This API is running without INSPECTOR_TOKEN set, so the inspector is switched off. Set it in .env and restart the server.',
        'inspector.unlock.rate_limited': 'Too many attempts. Wait a few minutes and try again.',
        'inspector.unlock.unreachable': "Couldn't reach the API to check that token.",
        'inspector.lock': 'Turn off',
        'inspector.compare': 'Also answer without Care-Pattern guidance (doubles the cost of a turn)',
        'inspector.matched': 'Matched',
        'inspector.noMatch': 'No Care Pattern matched',
        'inspector.details': 'Why this reply',
        'inspector.outcome': 'Outcome',
        'inspector.floor': 'Relevance floor',
        'inspector.retrievalMs': 'Retrieval time',
        'inspector.tokens': 'Tokens (prompt / completion)',
        'inspector.matchQuery': 'English match query (this is what was embedded)',
        'inspector.candidates': 'Candidates',
        'inspector.applied': 'Applied',
        'inspector.guidance': 'Guidance injected into the prompt',
        'inspector.noGuidance': 'Nothing was injected — the reply was written without Care-Pattern guidance.',
        'inspector.withGuidance': 'With Care-Pattern guidance',
        'inspector.withoutGuidance': 'Without it',
        'inspector.gapNote': 'A real situation with no pattern close enough — logged as a Care-Pattern gap.',

        // Prompt assembly and cost controls (Feature 8).
        'inspector.cached': 'cached',
        'inspector.cost': 'Cost (this turn / conversation)',
        'inspector.prompt': 'How the prompt was assembled',
        'inspector.verbatim': 'Messages sent in full',
        'inspector.summarized': 'Messages replaced by the summary',
        'inspector.maxReplyTokens': 'Reply cap (tokens)',
        'inspector.noSummary': 'No summary yet — the whole conversation still fits in the window.',
        'inspector.summarizedThisTurn': 'Summarized',
        'inspector.calls': 'Upstream calls on this turn',
        'inspector.callStep': 'Step',
        'inspector.callModel': 'Model',
        'inspector.callTokens': 'Tokens (in / out)',
        'inspector.callCost': 'Cost',
        'inspector.rejected':
            'That reply came back with no inspector data. The token is wrong, or the API is running without INSPECTOR_TOKEN set.',

        'login.title': 'Log in',
        'login.email': 'Email',
        'login.password': 'Password',
        'login.remember': 'Remember me',
        'login.submit': 'Log in',
    },
    'zh-CN': {
        'nav.home': '首页',
        'nav.startChatting': '开始咨询',
        'nav.meetTeam': '我们的团队',
        'nav.language': '语言',
        'nav.login': '登录',

        'hero.title': '无论家在何方，你都不孤单',
        'hero.lead':
            '为国际学生提供温暖、懂你文化的情感支持。匿名、安全，随时陪伴你——支持中文和英文。',
        'hero.ctaChat': '开始聊天',
        'hero.ctaCounselors': '认识我们的咨询师',

        'how.title': '使用方式',
        'how.subtitle': '简单三步，从第一句倾诉到与真人咨询师对话。',
        'how.s1.title': '说出你的心事',
        'how.s1.body': '开启一段私密对话——无需注册。随时匿名倾诉，用你最自在的语言。',
        'how.s2.title': '我们懂你的处境',
        'how.s2.body':
            'InnerSun 借助研究国际学生心理健康的学者的专业指导，以温暖且理解文化差异的方式回应你。',
        'how.s3.title': '连接真人咨询师',
        'how.s3.body': '当你准备好时，我们会帮你联系懂得留学他乡经历的真人咨询师。',

        'why.title': '为什么选择 InnerSun',
        'why.subtitle': '一个真正懂得国际学生处境的陪伴者。',
        'why.v1.title': '为留学生打造',
        'why.v1.body':
            '思乡、文化冲击、学业压力、签证焦虑——InnerSun 理解在异国生活与学习的种种挑战。',
        'why.v2.title': '源于专业研究',
        'why.v2.body':
            '回应基于临床专家撰写的国际学生心理健康指南，而非泛泛而谈的机器人答复。',
        'why.v3.title': '双语 · 全天候',
        'why.v3.body': '支持中英文对话，全天候陪伴——情绪来袭的任何时刻，而不只是工作时间。',

        'map.title': '连接家乡与此刻',
        'map.subtitle':
            '从美国的各所校园，到远在中国及世界各地的家人——InnerSun 让你始终与如家般的支持相连。',

        'trust.t1': '完全匿名',
        'trust.t2': '安全私密',
        'trust.t3': '懂你文化',
        'trust.t4': '随时陪伴',
        'trust.note':
            'InnerSun 提供的是情感支持，而非紧急医疗服务。如果你正处于危机中，请立即联系当地急救服务或危机热线。',

        'cta.title': '准备好倾诉了吗？',
        'cta.text': '免费开始，完全匿名。',
        'cta.chat': '开始聊天',
        'cta.human': '联系真人咨询师',

        'team.title': '我们的团队',
        'team.sample': '示例内容——此处为预览用的占位资料与照片，真实团队成员即将上线。',

        'footer.tagline': '面向国际学生的 AI 心理咨询助手',
        'footer.contact': '联系我们',
        'footer.emailLabel': '邮箱',
        'footer.links': '链接',
        'footer.privacy': '隐私政策',
        'footer.terms': '服务条款',
        'footer.rights': '保留所有权利。',

        'chat.heading': '有什么可以帮你的吗？',
        'chat.subheading': '说出你心里的任何想法，这里私密、不带评判。',
        'chat.placeholder': '给 InnerSun 发消息',
        'chat.send': '发送',
        'chat.disclaimer': 'InnerSun 提供的是支持性倾谈，而非医疗建议或紧急救助。如遇危机，请立即联系当地急救服务。',
        'chat.starter.homesick': '我最近特别想家',
        'chat.starter.stress': '学业压力压得我喘不过气',
        'chat.starter.friends': '在陌生的国家很难交到朋友',
        'chat.starter.human': '我可以和真人咨询师聊聊吗？',
        'chat.error': '抱歉，出了点问题，你的消息没能发送成功。请稍后再试一次。',
        'chat.error.offline': '无法连接到 InnerSun。请检查网络后再试一次。',
        'chat.error.timeout': '这次响应时间过长，已超时。请重新发送一次。',
        'chat.error.busy': 'InnerSun 现在有点忙，请稍后再试。',

        // 检索检视面板（Feature 22）——仅对已授权的查看者显示。
        'inspector.title': '检索检视',
        'inspector.tokenLabel': '检视令牌',
        'inspector.tokenHint': '向管理员索取令牌，或在 API 上设置 INSPECTOR_TOKEN。',
        'inspector.unlock': '解锁',
        'inspector.checking': '校验中…',
        'inspector.unlock.invalid': 'API 不接受这个令牌。',
        'inspector.unlock.not_configured':
            '这个 API 启动时没有设置 INSPECTOR_TOKEN，检视功能是关闭的。请在 .env 里设置后重启服务。',
        'inspector.unlock.rate_limited': '尝试次数过多，请等几分钟再试。',
        'inspector.unlock.unreachable': '无法连接 API，没法校验这个令牌。',
        'inspector.lock': '关闭',
        'inspector.compare': '同时生成一条不含关怀模式指导的回复（该轮成本翻倍）',
        'inspector.matched': '命中',
        'inspector.noMatch': '没有命中任何关怀模式',
        'inspector.details': '这条回复的由来',
        'inspector.outcome': '结果',
        'inspector.floor': '相关性下限',
        'inspector.retrievalMs': '检索耗时',
        'inspector.tokens': 'Token（提示 / 生成）',
        'inspector.matchQuery': '英文匹配查询（真正被嵌入的就是它）',
        'inspector.candidates': '候选模式',
        'inspector.applied': '已采用',
        'inspector.guidance': '注入到提示中的指导内容',
        'inspector.noGuidance': '没有注入任何内容——这条回复是在没有关怀模式指导的情况下写出的。',
        'inspector.withGuidance': '有关怀模式指导',
        'inspector.withoutGuidance': '没有指导',
        'inspector.gapNote': '这是一个真实处境，但没有足够接近的模式——已记录为关怀模式缺口。',

        // 提示词组装与成本控制（功能 8）。
        'inspector.cached': '命中缓存',
        'inspector.cost': '成本（本轮 / 整段对话）',
        'inspector.prompt': '提示词是怎么拼出来的',
        'inspector.verbatim': '原文发送的消息数',
        'inspector.summarized': '被摘要替代的消息数',
        'inspector.maxReplyTokens': '回复长度上限（token）',
        'inspector.noSummary': '还没有摘要——整段对话仍然放得进窗口。',
        'inspector.summarizedThisTurn': '本轮已摘要',
        'inspector.calls': '本轮向上游发起的调用',
        'inspector.callStep': '步骤',
        'inspector.callModel': '模型',
        'inspector.callTokens': 'Token（输入 / 输出）',
        'inspector.callCost': '成本',
        'inspector.rejected': '这条回复没有带回任何检视数据：要么令牌不对，要么 API 启动时没有设置 INSPECTOR_TOKEN。',

        'login.title': '登录',
        'login.email': '邮箱',
        'login.password': '密码',
        'login.remember': '记住我',
        'login.submit': '登录',
    },
};

export const DEFAULT_LOCALE = 'en';

export const AVAILABLE_LOCALES = [
    { code: 'en', label: 'English' },
    { code: 'zh-CN', label: '简体中文' },
];
